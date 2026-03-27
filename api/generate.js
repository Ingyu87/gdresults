const MODEL = "gemini-2.5-flash";

function buildSystemPrompt(grade) {
  return `
당신은 대한민국 초등학교 ${grade.replace("학년", "")}학년 담임 교사입니다.
'2026학년도 학교생활기록부 기재요령'과 '가동초등학교 ${grade} 1학기 평가계획'에 따라, 학생의 '학기말 종합의견' 예시 문장을 생성해야 합니다.

[필수 준수 규칙]
1. 문체: 모든 문장은 반드시 '~함.', '~음.', '~임.'으로 종결해야 함.
2. 어조: 과장된 표현을 지양하고 학생의 성취를 담백하고 객관적으로 서술해야 함.
3. 노력요함 문장: 부정적 표현 대신 참여 사실을 인정하고 성장 가능성을 시사하는 긍정적 표현 사용.
4. 내용: 제시된 성취기준을 학생이 달성한 모습을 구체적으로 묘사.
5. 개수: 요청한 정확한 개수만큼, 서로 중복되지 않는 문장 생성.
`;
}

function buildUserPrompt({ grade, subject, counts, domainEntry }) {
  return `
- 학년: ${grade}
- 과목: ${subject}
- 영역: ${domainEntry.domain}
- 성취기준: ${domainEntry.standard}

[생성 요청]
1. 잘함 수준 문장: ${counts.excellent}개 생성
2. 보통 수준 문장: ${counts.good}개 생성
3. 노력요함 수준 문장: ${counts.effort}개 생성

다음 JSON 키를 반드시 포함해 응답:
{
  "excellent_sentences": string[],
  "good_sentences": string[],
  "effort_sentences": string[]
}
`;
}

function validateOutput(json, counts) {
  const excellent = Array.isArray(json.excellent_sentences) ? json.excellent_sentences : [];
  const good = Array.isArray(json.good_sentences) ? json.good_sentences : [];
  const effort = Array.isArray(json.effort_sentences) ? json.effort_sentences : [];

  return {
    excellent_sentences: excellent.slice(0, counts.excellent),
    good_sentences: good.slice(0, counts.good),
    effort_sentences: effort.slice(0, counts.effort)
  };
}

async function callGemini({ apiKey, systemPrompt, userPrompt }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: userPrompt }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.8,
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
  if (!text) throw new Error("Gemini 응답에서 텍스트를 찾지 못했습니다.");
  return JSON.parse(text);
}

async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY 환경변수가 설정되지 않았습니다." });
  }

  try {
    const { grade, subject, counts, domainEntry } = req.body || {};
    if (!grade || !subject || !counts || !domainEntry?.domain || !domainEntry?.standard) {
      return res.status(400).json({ error: "요청 데이터가 올바르지 않습니다." });
    }

    const safeCounts = {
      excellent: Math.max(0, Number.parseInt(counts.excellent, 10) || 0),
      good: Math.max(0, Number.parseInt(counts.good, 10) || 0),
      effort: Math.max(0, Number.parseInt(counts.effort, 10) || 0)
    };

    const systemPrompt = buildSystemPrompt(grade);
    const userPrompt = buildUserPrompt({ grade, subject, counts: safeCounts, domainEntry });
    const raw = await callGemini({ apiKey, systemPrompt, userPrompt });
    const normalized = validateOutput(raw, safeCounts);
    return res.status(200).json(normalized);
  } catch (error) {
    return res.status(500).json({ error: error.message || "서버 오류" });
  }
}

module.exports = handler;
