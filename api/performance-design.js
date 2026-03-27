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

function buildFallbackResult({ grade, subject, domainEntry, compactBase, requestText }) {
  const req = requestText ? `추가 요청: ${requestText}` : "추가 요청: 없음";
  return {
    plan_text: [
      `${grade} ${subject} ${domainEntry.domain} 영역 수행평가를 성취기준 중심으로 운영함.`,
      `핵심 성취기준: ${domainEntry.standard}`,
      `평가요소: ${compactBase.evaluation_element || "핵심 개념 이해 및 적용"}`,
      `수업·평가 방법: ${compactBase.lesson_assessment_method || "활동 중심 수업과 관찰·산출물 평가를 병행함."}`,
      `평가시기: ${compactBase.assessment_time || "학기 중 단원 학습 완료 시점"}`,
      req,
      "준비물: 학생 활동지, 필기구, 발표 자료(필요 시).",
      "운영 팁: 단계별 안내 후 개별 수행과 피드백을 제공함."
    ].join("\n"),
    rubric_text: [
      "상: 평가요소를 정확히 수행하고 근거를 명확히 설명함.",
      "중: 평가요소를 대체로 수행하고 일부 설명함.",
      "하: 평가요소의 일부를 수행하며 안내에 따라 참여함.",
      `기준 참고(잘함): ${compactBase.criteria_well || "-"}`,
      `기준 참고(보통): ${compactBase.criteria_mid || "-"}`,
      `기준 참고(노력요함): ${compactBase.criteria_need || "-"}`
    ].join("\n"),
    worksheet_text: [
      "[학생용 수행평가지]",
      "1. 활동 목표를 읽고 오늘 수행할 과제를 확인하세요.",
      "2. 제시된 자료를 보고 핵심 내용을 정리하세요.",
      "3. 문제를 해결하고 결과를 서술 또는 발표 자료로 작성하세요.",
      "4. 자기점검: 이해한 점 1가지, 더 연습할 점 1가지를 쓰세요.",
      "5. 제출물: 활동지/결과물/발표 내용"
    ].join("\n"),
    answer_example_text: [
      "[예시답안]",
      "문항 1) 핵심 개념을 정확히 설명하고 적용 사례를 제시함.",
      "문항 2) 제시 자료를 근거로 자신의 생각을 논리적으로 서술함.",
      "문항 3) 활동 결과를 정리하여 전달력 있게 발표함.",
      "자기점검) 잘한 점과 보완할 점을 구체적으로 작성함."
    ].join("\n")
  };
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
마크다운 문법(**, __, #, -, ``` 등)은 사용하지 말고 순수 텍스트로 작성.
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

    let parsed;
    try {
      parsed = await callGemini({ apiKey, systemPrompt, userPrompt });
    } catch (_firstError) {
      // 1차 생성 실패 시 폴백 결과를 반환하여 수업 설계 흐름이 중단되지 않도록 처리
      parsed = buildFallbackResult({ grade, subject, domainEntry, compactBase, requestText });
    }
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
