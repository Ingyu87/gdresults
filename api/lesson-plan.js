const MODEL = "gemini-2.5-flash";

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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: controller.signal
  });
  clearTimeout(timeout);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API 오류(${response.status}): ${errorText}`);
  }
  const result = await response.json();
  const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini 응답 텍스트가 없습니다.");
  return parseJsonSafely(text);
}

async function callGeminiText({ apiKey, systemPrompt, userPrompt }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: userPrompt }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
      temperature: 0.2,
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
    throw new Error(`Gemini 텍스트 호출 실패(${response.status}): ${errorText}`);
  }
  const result = await response.json();
  return String(result?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
}

async function normalizeToJsonWithGemini({ apiKey, rawText }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
  const prompt = `
다음 텍스트를 아래 키를 갖는 JSON으로 변환:
keys:
- meta(unit, class_target, datetime, lesson_time_page, teaching_model, competency, area, core_idea, achievement_standard, inquiry_question, learning_objective, learning_topic, teacher_intent)
- evaluation_plan(array of {category, method, element, level_high, level_mid, level_low, feedback})
- learning_process(array of {stage, learning_form, teacher_activity, student_activity, minutes, materials, notes, assessment})

텍스트:
${String(rawText || "").slice(0, 14000)}
`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1
    }
  };
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`JSON 정규화 실패(${response.status}): ${errorText}`);
  }
  const result = await response.json();
  const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("JSON 정규화 응답 텍스트가 없습니다.");
  return parseJsonSafely(text);
}

function coerceLessonPlanFromText(rawText) {
  const text = String(rawText || "").trim();
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const take = (idx) => lines[idx] || "";
  return {
    meta: {
      unit: take(0),
      class_target: take(1),
      datetime: take(2),
      lesson_time_page: take(3),
      teaching_model: take(4),
      competency: take(5),
      area: take(6),
      core_idea: take(7),
      achievement_standard: take(8),
      inquiry_question: take(9),
      learning_objective: take(10),
      learning_topic: take(11),
      teacher_intent: lines.slice(12, 18).join(" ")
    },
    evaluation_plan: [
      {
        category: "통합",
        method: "관찰/서술",
        element: lines.slice(18, 21).join(" "),
        level_high: lines.slice(21, 23).join(" "),
        level_mid: lines.slice(23, 25).join(" "),
        level_low: lines.slice(25, 27).join(" "),
        feedback: lines.slice(27, 31).join(" ")
      }
    ],
    learning_process: [
      {
        stage: "도입",
        learning_form: "전체",
        teacher_activity: lines.slice(31, 34).join(" "),
        student_activity: lines.slice(34, 37).join(" "),
        minutes: "5",
        materials: "",
        notes: "",
        assessment: ""
      },
      {
        stage: "전개",
        learning_form: "모둠/개별",
        teacher_activity: lines.slice(37, 41).join(" "),
        student_activity: lines.slice(41, 45).join(" "),
        minutes: "30",
        materials: "",
        notes: "",
        assessment: ""
      },
      {
        stage: "정리",
        learning_form: "전체",
        teacher_activity: lines.slice(45, 48).join(" "),
        student_activity: lines.slice(48, 51).join(" "),
        minutes: "5",
        materials: "",
        notes: "",
        assessment: ""
      }
    ]
  };
}

async function callGeminiWithRetry({ apiKey, systemPrompt, userPrompt, retries = 3 }) {
  let lastError;
  for (let i = 0; i < retries; i += 1) {
    try {
      return await callGemini({ apiKey, systemPrompt, userPrompt });
    } catch (error) {
      lastError = error;
      const wait = 800 * Math.pow(2, i);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  throw lastError || new Error("Gemini 호출 실패");
}

async function handler(req, res) {
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

    let parsed;
    try {
      parsed = await callGeminiWithRetry({ apiKey, systemPrompt, userPrompt, retries: 3 });
    } catch (_error) {
      let rawText = "";
      try {
        rawText = await callGeminiText({
          apiKey,
          systemPrompt: "아래 요청에 대해 텍스트로 상세히 답변하라.",
          userPrompt
        });
      } catch (_textError) {
        rawText = "";
      }
      if (rawText) {
        try {
          parsed = await normalizeToJsonWithGemini({ apiKey, rawText });
        } catch (_normalizeError) {
          parsed = coerceLessonPlanFromText(rawText);
        }
      } else {
        parsed = { meta: {}, evaluation_plan: [], learning_process: [] };
      }
    }
    return res.status(200).json({
      meta: parsed?.meta || {},
      evaluation_plan: Array.isArray(parsed?.evaluation_plan) ? parsed.evaluation_plan : [],
      learning_process: Array.isArray(parsed?.learning_process) ? parsed.learning_process : []
    });
  } catch (error) {
    return res.status(500).json({
      error: `Gemini 생성에 실패했습니다. 잠시 후 다시 시도해주세요. (${error.message || "서버 오류"})`
    });
  }
}

module.exports = handler;
