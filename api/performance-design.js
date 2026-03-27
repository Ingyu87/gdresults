const MODEL = "gemini-2.5-flash";

async function callGemini({ apiKey, systemPrompt, userPrompt }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: userPrompt }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.7,
      topP: 0.95
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
  return JSON.parse(text);
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

    const systemPrompt = `
당신은 대한민국 초등학교 교사이며, 수행평가 설계 전문가임.
출력은 반드시 JSON으로만 작성.
현장 적용 가능한 형태로 구체적으로 작성.
`;

    const userPrompt = `
다음 정보로 수행평가를 작성:
- 학년: ${grade}
- 과목: ${subject}
- 영역: ${domainEntry.domain}
- 성취기준: ${domainEntry.standard}
- PDF 추출 평가요소: ${baseData?.evaluation_element || "없음"}
- PDF 추출 수업·평가 방법: ${baseData?.lesson_assessment_method || "없음"}
- PDF 추출 평가기준(잘함): ${baseData?.criteria?.잘함 || "없음"}
- PDF 추출 평가기준(보통): ${baseData?.criteria?.보통 || "없음"}
- PDF 추출 평가기준(노력요함): ${baseData?.criteria?.노력요함 || "없음"}
- PDF 추출 평가시기: ${baseData?.assessment_time || "없음"}
- 추가 요청: ${requestText || "없음"}

아래 JSON 키로 응답:
{
  "plan_text": "교사용 수행평가 방안 (목표, 수업 흐름, 준비물, 운영 팁)",
  "rubric_text": "평가기준표 (상/중/하 또는 3수준 이상, 관찰 포인트 포함)",
  "worksheet_text": "학생용 수행평가지 (활동 안내, 제출물, 자기점검 항목)"
}
`;

    const parsed = await callGemini({ apiKey, systemPrompt, userPrompt });
    return res.status(200).json({
      plan_text: String(parsed?.plan_text || "").trim(),
      rubric_text: String(parsed?.rubric_text || "").trim(),
      worksheet_text: String(parsed?.worksheet_text || "").trim()
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "서버 오류" });
  }
}
