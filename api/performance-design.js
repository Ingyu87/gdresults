const MODEL = "gemini-2.5-flash";
export const config = {
  maxDuration: 60
};

function trimText(value, max = 700) {
  const text = String(value || "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)} ...`;
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

function parseJsonSafely(rawText) {
  const text = String(rawText || "").trim();
  if (!text) throw new Error("빈 JSON 응답입니다.");

  try {
    return JSON.parse(text);
  } catch (_firstError) {
    // 1) 코드블록 제거
    const deFenced = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    try {
      return JSON.parse(deFenced);
    } catch (_secondError) {
      // 2) 첫 { ~ 마지막 } 추출 후 제어문자 제거
      const start = deFenced.indexOf("{");
      const end = deFenced.lastIndexOf("}");
      if (start !== -1 && end !== -1 && end > start) {
        const candidate = deFenced.slice(start, end + 1);
        // JSON 문자열에서 문제되는 제어문자 제거
        const cleaned = candidate.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ");
        return JSON.parse(cleaned);
      }
      throw new Error("JSON 파싱 실패: 유효한 JSON 객체를 찾지 못했습니다.");
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY 환경변수가 설정되지 않았습니다." });
  }

  try {
    const { grade, subject, domainEntry, requestText, baseData } = req.body || {};
    if (!grade || !subject || !domainEntry?.domain || !domainEntry?.standard) {
      return res.status(400).json({ error: "요청 데이터가 올바르지 않습니다." });
    }

    const compactBase = {
      evaluation_element: trimText(baseData?.evaluation_element, 500),
      lesson_assessment_method: trimText(baseData?.lesson_assessment_method, 700),
      criteria_well: trimText(baseData?.criteria?.잘함, 500),
      criteria_mid: trimText(baseData?.criteria?.보통, 500),
      criteria_need: trimText(baseData?.criteria?.노력요함, 500),
      assessment_time: trimText(baseData?.assessment_time, 80)
    };

    const systemPrompt = `
당신은 대한민국 초등학교 교사이며, 수행평가 설계 전문가임.
출력은 반드시 JSON으로만 작성.
현장 적용 가능한 형태로 구체적으로 작성하되, 간결하고 실행 가능한 문장 중심으로 작성.
`;

    const userPrompt = `
다음 정보로 수행평가를 작성:
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

아래 JSON 키로 응답:
{
  "plan_text": "교사용 수행평가 방안 (목표, 수업 흐름, 준비물, 운영 팁) - 8~12줄",
  "rubric_text": "평가기준표 (상/중/하 또는 3수준 이상, 관찰 포인트 포함) - 8~12줄",
  "worksheet_text": "학생용 수행평가지 (활동 안내, 제출물, 자기점검 항목) - 10~16줄",
  "answer_example_text": "수행평가지 문항의 예시답안 (문항 번호별 또는 항목별) - 8~14줄"
}
`;

    const parsed = await callGemini({ apiKey, systemPrompt, userPrompt });
    return res.status(200).json({
      plan_text: String(parsed?.plan_text || "").trim(),
      rubric_text: String(parsed?.rubric_text || "").trim(),
      worksheet_text: String(parsed?.worksheet_text || "").trim(),
      answer_example_text: String(parsed?.answer_example_text || "").trim()
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "서버 오류" });
  }
}
