const MODEL = "gemini-2.5-flash";
export const config = { maxDuration: 60 };

function trimText(value, max = 700) {
  const text = String(value || "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)} ...`;
}

function parseJsonSafely(rawText) {
  const text = String(rawText || "").trim();
  if (!text) throw new Error("빈 JSON 응답입니다.");
  try {
    return JSON.parse(text);
  } catch (_err1) {
    const deFenced = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    try {
      return JSON.parse(deFenced);
    } catch (_err2) {
      const start = deFenced.indexOf("{");
      const end = deFenced.lastIndexOf("}");
      if (start !== -1 && end !== -1 && end > start) {
        const cleaned = deFenced.slice(start, end + 1).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ");
        return JSON.parse(cleaned);
      }
      throw new Error("JSON 파싱 실패");
    }
  }
}

async function callGemini({ apiKey, systemPrompt, userPrompt }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: userPrompt }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.4,
      topP: 0.9
    }
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API 오류(${response.status}): ${errorText}`);
  }
  const result = await response.json();
  const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini 응답 텍스트가 없습니다.");
  return parseJsonSafely(text);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY 환경변수가 설정되지 않았습니다." });

  try {
    const { grade, subject, domainEntry, requestText, baseData } = req.body || {};
    if (!grade || !subject || !domainEntry?.domain || !domainEntry?.standard) {
      return res.status(400).json({ error: "요청 데이터가 올바르지 않습니다." });
    }

    const compactBase = {
      evaluation_element: trimText(baseData?.evaluation_element, 500),
      lesson_assessment_method: trimText(baseData?.lesson_assessment_method, 700),
      criteria_well: trimText(baseData?.criteria?.잘함, 450),
      criteria_mid: trimText(baseData?.criteria?.보통, 450),
      criteria_need: trimText(baseData?.criteria?.노력요함, 450),
      assessment_time: trimText(baseData?.assessment_time, 80)
    };

    const systemPrompt = `
당신은 대한민국 초등학교 교사이며 2022 개정 교육과정 적용 교수·학습 과정안 작성 전문가임.
출력은 반드시 JSON, 마크다운 문법은 사용하지 말 것.
결과는 표에 바로 넣을 수 있도록 간결하고 구체적으로 작성.
`;

    const userPrompt = `
다음 정보를 바탕으로 "교수학습과정안(평가 기반)" 표 데이터를 생성:
- 학년: ${grade}
- 과목: ${subject}
- 영역: ${domainEntry.domain}
- 성취기준: ${domainEntry.standard}
- PDF 추출 평가요소: ${compactBase.evaluation_element || "없음"}
- PDF 추출 수업·평가 방법: ${compactBase.lesson_assessment_method || "없음"}
- PDF 추출 평가기준(잘함): ${compactBase.criteria_well || "없음"}
- PDF 추출 평가기준(보통): ${compactBase.criteria_mid || "없음"}
- PDF 추출 평가기준(노력요함): ${compactBase.criteria_need || "없음"}
- PDF 추출 평가시기: ${compactBase.assessment_time || "없음"}
- 추가 요청: ${requestText || "없음"}

아래 JSON 스키마로 응답:
{
  "meta": {
    "unit": "",
    "class_target": "",
    "datetime": "",
    "lesson_time_page": "",
    "teaching_model": "",
    "competency": "",
    "area": "",
    "core_idea": "",
    "achievement_standard": "",
    "inquiry_question": "",
    "learning_objective": "",
    "learning_topic": "",
    "teacher_intent": ""
  },
  "evaluation_plan": [
    {
      "category": "",
      "method": "",
      "element": "",
      "level_high": "",
      "level_mid": "",
      "level_low": "",
      "feedback": ""
    }
  ],
  "learning_process": [
    {
      "stage": "",
      "learning_form": "",
      "teacher_activity": "",
      "student_activity": "",
      "minutes": "",
      "materials": "",
      "notes": "",
      "assessment": ""
    }
  ]
}
`;

    const parsed = await callGemini({ apiKey, systemPrompt, userPrompt });
    return res.status(200).json({
      meta: parsed?.meta || {},
      evaluation_plan: Array.isArray(parsed?.evaluation_plan) ? parsed.evaluation_plan : [],
      learning_process: Array.isArray(parsed?.learning_process) ? parsed.learning_process : []
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "서버 오류" });
  }
}
