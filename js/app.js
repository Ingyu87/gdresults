const settingsForm = document.getElementById("settings-form");
const resultsContent = document.getElementById("results-content");
const toast = document.getElementById("toast");
const combineButton = document.getElementById("combine-button");
const combinedResultsContent = document.getElementById("combined-results-content");
const gradeSelect = document.getElementById("grade-select");
const subjectSelect = document.getElementById("subject-select");
const tabOpinionBtn = document.getElementById("tab-opinion-btn");
const tabPerformanceBtn = document.getElementById("tab-performance-btn");
const tabOpinionSection = document.getElementById("tab-opinion-section");
const tabPerformanceSection = document.getElementById("tab-performance-section");
const performanceForm = document.getElementById("performance-form");
const perfGradeSelect = document.getElementById("perf-grade-select");
const perfSubjectSelect = document.getElementById("perf-subject-select");
const perfDomainSelect = document.getElementById("perf-domain-select");
const performanceResults = document.getElementById("performance-results");
const performanceSubmitBtn = document.getElementById("performance-submit-btn");

let toastTimer;
let globalGeneratedData = {};
let evaluationPlanData = {};
let performancePlanData = {};

const DEFAULT_HINT_HTML = `
  <p class="p-10 text-center text-gray-500 bg-white rounded-lg shadow-md border border-slate-200">
    위에서 학년, 과목, 개수를 선택하고 '예시 문장 생성하기' 버튼을 눌러주세요.
  </p>
`;

function updateSubjectSelect(selectedGrade) {
  subjectSelect.innerHTML = "";
  const subjects = Object.keys(evaluationPlanData[selectedGrade] || {});

  if (subjects.length === 0) {
    const option = document.createElement("option");
    option.textContent = "데이터 없음";
    option.disabled = true;
    subjectSelect.appendChild(option);
    return;
  }

  subjects.forEach((subject) => {
    const option = document.createElement("option");
    option.value = subject;
    option.textContent = subject;
    subjectSelect.appendChild(option);
  });
  subjectSelect.value = subjects[0];
}

function updatePerformanceSubjectSelect(selectedGrade) {
  perfSubjectSelect.innerHTML = "";
  const subjects = Object.keys(evaluationPlanData[selectedGrade] || {});
  if (subjects.length === 0) return;

  subjects.forEach((subject) => {
    const option = document.createElement("option");
    option.value = subject;
    option.textContent = subject;
    perfSubjectSelect.appendChild(option);
  });
  perfSubjectSelect.value = subjects[0];
  updatePerformanceDomainSelect(selectedGrade, perfSubjectSelect.value);
}

function updatePerformanceDomainSelect(selectedGrade, selectedSubject) {
  perfDomainSelect.innerHTML = "";
  const domains =
    performancePlanData[selectedGrade]?.[selectedSubject] ||
    evaluationPlanData[selectedGrade]?.[selectedSubject] ||
    [];
  domains.forEach((entry, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${entry.domain}`;
    perfDomainSelect.appendChild(option);
  });
}

function parseCount(id) {
  const el = document.getElementById(id);
  const value = Number.parseInt(el.value, 10);
  return Number.isFinite(value) ? value : 0;
}

function setLoadingState(isLoading) {
  const submitButton = settingsForm.querySelector('button[type="submit"]');
  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading ? "생성 중..." : "1. 영역별 예시 문장 생성하기";
}

function resetForGradeChange() {
  resultsContent.innerHTML = `
    <p class="p-10 text-center text-gray-500 bg-white rounded-lg shadow-md border border-slate-200">
      학년이 변경되었습니다. 과목과 개수를 선택하고 '생성하기' 버튼을 눌러주세요.
    </p>
  `;
  combinedResultsContent.innerHTML = "";
  combineButton.disabled = true;
  globalGeneratedData = {};
}

function createRowHtml(level, sentence, levelColor) {
  const safeAttr = sentence.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  return `
    <tr class="result-row hover:bg-blue-50 cursor-pointer transition-colors duration-150" data-sentence="${safeAttr}">
      <td class="p-3 text-sm font-bold ${levelColor} border-b border-slate-200 align-top">${level}</td>
      <td class="p-3 text-sm text-gray-800 leading-relaxed border-b border-slate-200 align-top">${sentence}</td>
    </tr>
  `;
}

function createAccordionItem(domainEntry, sentencesData) {
  const accordionItem = document.createElement("div");
  accordionItem.className = "border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm";

  const accordionHeader = document.createElement("button");
  accordionHeader.type = "button";
  accordionHeader.className =
    "accordion-header w-full p-4 text-left font-bold text-lg text-blue-800 bg-slate-50 hover:bg-slate-100 border-b border-slate-200 flex justify-between items-center";
  accordionHeader.innerHTML = `
    <span>${domainEntry.domain}</span>
    <svg class="w-5 h-5 transform transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
    </svg>
  `;

  const accordionContent = document.createElement("div");
  accordionContent.className = "accordion-content";

  let tableHtml = `
    <div class="p-4 bg-blue-50 border-b border-blue-200">
      <span class="text-xs font-semibold text-blue-700 uppercase">성취기준</span>
      <p class="text-sm text-blue-900 mt-1">${domainEntry.standard}</p>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full min-w-[600px] border-collapse">
        <thead class="bg-slate-50">
          <tr>
            <th class="p-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-slate-200 w-24">성취수준</th>
            <th class="p-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-slate-200">예시 문장 (행을 클릭하여 복사/선택 해제)</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
  `;

  (sentencesData.excellent_sentences || []).forEach((sentence) => {
    tableHtml += createRowHtml("잘함", sentence, "text-blue-600");
  });
  (sentencesData.good_sentences || []).forEach((sentence) => {
    tableHtml += createRowHtml("보통", sentence, "text-green-600");
  });
  (sentencesData.effort_sentences || []).forEach((sentence) => {
    tableHtml += createRowHtml("노력요함", sentence, "text-orange-600");
  });

  tableHtml += "</tbody></table></div>";
  accordionContent.innerHTML = tableHtml;
  accordionItem.append(accordionHeader, accordionContent);
  return accordionItem;
}

function createErrorAccordionItem(domainEntry, errorMessage) {
  const accordionItem = document.createElement("div");
  accordionItem.className = "border border-red-200 rounded-lg overflow-hidden bg-white shadow-sm";
  accordionItem.innerHTML = `
    <div class="accordion-header w-full p-4 text-left font-bold text-lg text-red-800 bg-red-50 border-b border-red-200 flex justify-between items-center">
      <span>${domainEntry.domain} (생성 실패)</span>
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
      </svg>
    </div>
    <div class="accordion-content show p-4 text-red-700">
      <p>이 영역의 문장을 생성하는 데 실패했습니다.</p>
      <p class="text-xs mt-2">오류: ${errorMessage}</p>
    </div>
  `;
  return accordionItem;
}

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_err) {
    // fall through
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();

  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch (_err) {
    ok = false;
  }
  document.body.removeChild(textarea);
  return ok;
}

function showToast(message) {
  if (toastTimer) clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("show");
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2000);
}

function setActiveTab(tab) {
  const isOpinion = tab === "opinion";
  tabOpinionSection.classList.toggle("hidden", !isOpinion);
  tabPerformanceSection.classList.toggle("hidden", isOpinion);
  tabOpinionBtn.className = `tab-btn px-4 py-2 rounded-lg font-semibold ${isOpinion ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-700"}`;
  tabPerformanceBtn.className = `tab-btn px-4 py-2 rounded-lg font-semibold ${isOpinion ? "bg-slate-200 text-slate-700" : "bg-purple-600 text-white"}`;
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function createCombinedParagraphBox(paragraph, index, colorClasses) {
  const div = document.createElement("div");
  div.className = "combined-paragraph-box p-4 cursor-pointer hover:bg-gray-50 transition-all duration-150";
  div.dataset.paragraph = paragraph;
  div.innerHTML = `
    <p class="text-base text-gray-700 leading-relaxed">
      <span class="font-bold ${colorClasses.textLight} mr-2">${index}.</span>
      ${paragraph}
    </p>
  `;
  return div;
}

function generateCombinedOpinion() {
  combinedResultsContent.innerHTML = "";
  const combinedCount = Math.max(parseCount("count-combined"), 1);

  const levels = [
    { key: "excellent_sentences", level: "잘함", colorClasses: { text: "text-blue-700", border: "border-blue-200", bg: "bg-blue-50", textLight: "text-blue-600" } },
    { key: "good_sentences", level: "보통", colorClasses: { text: "text-green-700", border: "border-green-200", bg: "bg-green-50", textLight: "text-green-600" } },
    { key: "effort_sentences", level: "노력요함", colorClasses: { text: "text-orange-700", border: "border-orange-200", bg: "bg-orange-50", textLight: "text-orange-600" } }
  ];

  let hasGeneratedSomething = false;

  levels.forEach((levelInfo) => {
    const levelContainer = document.createElement("div");
    levelContainer.className = `border ${levelInfo.colorClasses.border} rounded-lg shadow-sm bg-white overflow-hidden`;
    levelContainer.innerHTML = `
      <div class="p-4 ${levelInfo.colorClasses.bg} border-b ${levelInfo.colorClasses.border}">
        <h3 class="text-xl font-bold ${levelInfo.colorClasses.text}">${levelInfo.level} 종합의견 예시</h3>
        <p class="text-sm text-gray-500 mt-1">
          아래 ${levelInfo.level} 예시 ${combinedCount}개는 각 영역의 문장을 하나씩 조합한 결과입니다. (클릭하여 복사/선택 해제)
        </p>
      </div>
    `;

    const paragraphContainer = document.createElement("div");
    paragraphContainer.className = "divide-y divide-slate-100";

    let generatedForThisLevel = 0;
    for (let i = 0; i < combinedCount; i += 1) {
      const collectedSentences = [];
      Object.values(globalGeneratedData).forEach((domainData) => {
        const list = domainData[levelInfo.key] || [];
        if (list.length > 0) {
          const randomIndex = Math.floor(Math.random() * list.length);
          collectedSentences.push(list[randomIndex]);
        }
      });

      if (collectedSentences.length > 0) {
        hasGeneratedSomething = true;
        generatedForThisLevel += 1;
        shuffleArray(collectedSentences);
        const paragraph = collectedSentences.join(" ");
        paragraphContainer.appendChild(createCombinedParagraphBox(paragraph, i + 1, levelInfo.colorClasses));
      }
    }

    if (generatedForThisLevel > 0) {
      levelContainer.appendChild(paragraphContainer);
      combinedResultsContent.appendChild(levelContainer);
    }
  });

  if (!hasGeneratedSomething) {
    combinedResultsContent.innerHTML = `<p class="p-10 text-center text-gray-500">조합할 문장이 없습니다. 먼저 '영역별 예시 문장 생성하기'를 실행해주세요.</p>`;
  }
}

async function requestDomainGeneration({ grade, subject, counts, domainEntry }) {
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grade, subject, counts, domainEntry })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

async function requestPerformanceDesign({ grade, subject, domainEntry, requestText }) {
  const response = await fetch("/api/performance-design", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grade, subject, domainEntry, requestText, baseData: domainEntry })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

function createCopyCard(title, content, toneClass = "border-slate-200") {
  const box = document.createElement("div");
  box.className = `p-4 border ${toneClass} rounded-lg bg-white`;
  box.innerHTML = `
    <div class="flex items-center justify-between mb-2">
      <h4 class="font-bold text-slate-800">${title}</h4>
      <button type="button" class="copy-performance px-3 py-1 text-sm rounded bg-slate-800 text-white hover:bg-slate-700">복사</button>
    </div>
    <pre class="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed">${content}</pre>
  `;
  const btn = box.querySelector(".copy-performance");
  btn.addEventListener("click", async () => {
    const ok = await copyToClipboard(content);
    showToast(ok ? `${title} 복사 완료` : "복사에 실패했습니다.");
  });
  return box;
}

async function handlePerformanceSubmit(event) {
  event.preventDefault();
  performanceSubmitBtn.disabled = true;
  performanceSubmitBtn.textContent = "생성 중...";
  performanceResults.innerHTML = `
    <div class="p-8 text-center text-gray-500 bg-white rounded-lg shadow-md border border-slate-200 flex flex-col items-center justify-center">
      <div class="loader mb-4"></div>
      <p class="font-medium text-purple-600">수행평가 방안/문항을 생성 중입니다...</p>
    </div>
  `;

  const grade = perfGradeSelect.value;
  const subject = perfSubjectSelect.value;
  const domainIndex = Number.parseInt(perfDomainSelect.value, 10);
  const domainEntry =
    performancePlanData[grade]?.[subject]?.[domainIndex] ||
    evaluationPlanData[grade]?.[subject]?.[domainIndex];
  const requestText = (document.getElementById("perf-request").value || "").trim();

  if (!domainEntry) {
    performanceResults.innerHTML = `<p class="p-8 text-center text-red-500 bg-white rounded-lg shadow-md border border-red-200">영역 정보를 찾지 못했습니다.</p>`;
    performanceSubmitBtn.disabled = false;
    performanceSubmitBtn.textContent = "수행평가 방안 + 수행평가지 생성하기";
    return;
  }

  try {
    const result = await requestPerformanceDesign({ grade, subject, domainEntry, requestText });
    performanceResults.innerHTML = "";

    const summary = document.createElement("div");
    summary.className = "p-4 border border-purple-200 rounded-lg bg-purple-50 text-purple-900";
    summary.innerHTML = `
      <p class="font-semibold">${grade} ${subject} / ${domainEntry.domain}</p>
      <p class="text-sm mt-1">${domainEntry.standard}</p>
    `;
    performanceResults.appendChild(summary);

    if (domainEntry.evaluation_element || domainEntry.lesson_assessment_method || domainEntry.criteria?.잘함) {
      const baseBox = document.createElement("div");
      baseBox.className = "p-4 border border-violet-200 rounded-lg bg-violet-50";
      baseBox.innerHTML = `
        <h4 class="font-bold text-violet-800 mb-2">PDF 기반 추출 정보</h4>
        <p class="text-sm text-violet-900 mb-2"><strong>평가요소:</strong> ${domainEntry.evaluation_element || "-"}</p>
        <p class="text-sm text-violet-900 mb-2"><strong>수업·평가 방법:</strong> ${domainEntry.lesson_assessment_method || "-"}</p>
        <p class="text-sm text-violet-900 mb-2"><strong>평가기준(잘함):</strong> ${domainEntry.criteria?.잘함 || "-"}</p>
        <p class="text-sm text-violet-900 mb-2"><strong>평가기준(보통):</strong> ${domainEntry.criteria?.보통 || "-"}</p>
        <p class="text-sm text-violet-900"><strong>평가기준(노력요함):</strong> ${domainEntry.criteria?.노력요함 || "-"}</p>
      `;
      performanceResults.appendChild(baseBox);
    }

    performanceResults.appendChild(createCopyCard("수행평가 방안", result.plan_text || "", "border-purple-200"));
    performanceResults.appendChild(createCopyCard("평가기준(루브릭)", result.rubric_text || "", "border-indigo-200"));
    performanceResults.appendChild(createCopyCard("수행평가지(학생용)", result.worksheet_text || "", "border-emerald-200"));
  } catch (error) {
    performanceResults.innerHTML = `
      <p class="p-8 text-center text-red-500 bg-white rounded-lg shadow-md border border-red-200">
        생성 실패: ${error.message}
      </p>
    `;
  } finally {
    performanceSubmitBtn.disabled = false;
    performanceSubmitBtn.textContent = "수행평가 방안 + 수행평가지 생성하기";
  }
}

async function generateAiResults(grade, subject, counts, subjectData) {
  resultsContent.innerHTML = `
    <div class="p-10 text-center text-gray-500 bg-white rounded-lg shadow-md border border-slate-200 flex flex-col items-center justify-center">
      <div class="loader mb-4"></div>
      <p class="font-medium text-blue-600">AI가 '${grade} ${subject}' 과목의 문장을 생성 중입니다...</p>
      <p class="text-sm text-gray-400 mt-2">과목의 영역 수에 따라 10~30초 정도 소요될 수 있습니다.</p>
    </div>
  `;

  globalGeneratedData = {};
  const promises = subjectData.map(async (domainEntry) => {
    try {
      const data = await requestDomainGeneration({ grade, subject, counts, domainEntry });
      return { domainEntry, parsedJson: data, isError: false };
    } catch (error) {
      return { domainEntry, isError: true, errorMessage: error.message || "알 수 없는 오류" };
    }
  });

  const results = await Promise.all(promises);
  resultsContent.innerHTML = "";

  results.forEach((result) => {
    if (result.isError) {
      resultsContent.appendChild(createErrorAccordionItem(result.domainEntry, result.errorMessage));
      return;
    }
    globalGeneratedData[result.domainEntry.domain] = result.parsedJson;
    resultsContent.appendChild(createAccordionItem(result.domainEntry, result.parsedJson));
  });
}

async function handleSubmit(event) {
  event.preventDefault();
  setLoadingState(true);
  combineButton.disabled = true;
  combinedResultsContent.innerHTML = "";
  resultsContent.innerHTML = "";
  globalGeneratedData = {};

  const grade = gradeSelect.value;
  const subject = subjectSelect.value;
  const counts = {
    excellent: parseCount("count-excellent"),
    good: parseCount("count-good"),
    effort: parseCount("count-effort")
  };

  if (counts.excellent === 0 && counts.good === 0 && counts.effort === 0) {
    resultsContent.innerHTML = `
      <p class="p-10 text-center text-gray-500 bg-white rounded-lg shadow-md border border-slate-200">
        모든 개수가 0입니다. 1개 이상의 문장을 요청해주세요.
      </p>
    `;
    setLoadingState(false);
    return;
  }

  const subjectData = evaluationPlanData[grade]?.[subject];
  if (!subjectData || subjectData.length === 0) {
    resultsContent.innerHTML = `
      <p class="p-10 text-center text-red-500 bg-white rounded-lg shadow-md border border-red-200">
        오류: '${grade}' '${subject}' 과목의 평가 계획 데이터를 찾을 수 없습니다.
      </p>
    `;
    setLoadingState(false);
    return;
  }

  try {
    await generateAiResults(grade, subject, counts, subjectData);
    combineButton.disabled = Object.keys(globalGeneratedData).length === 0;
  } catch (_error) {
    resultsContent.innerHTML = `
      <p class="p-10 text-center text-red-500 bg-white rounded-lg shadow-md border border-red-200">
        문장 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.
      </p>
    `;
  } finally {
    setLoadingState(false);
  }
}

async function loadEvaluationPlanData() {
  const response = await fetch("/data/evaluation-plan.json");
  if (!response.ok) {
    throw new Error(`평가계획 JSON 로딩 실패 (HTTP ${response.status})`);
  }
  const json = await response.json();
  if (!json || typeof json !== "object") {
    throw new Error("평가계획 JSON 형식이 올바르지 않습니다.");
  }
  evaluationPlanData = json;
}

async function loadPerformancePlanData() {
  const response = await fetch("/data/performance-plan.json");
  if (!response.ok) {
    throw new Error(`수행평가 JSON 로딩 실패 (HTTP ${response.status})`);
  }
  const json = await response.json();
  if (!json || typeof json !== "object") {
    throw new Error("수행평가 JSON 형식이 올바르지 않습니다.");
  }
  performancePlanData = json;
}

function bindEvents() {
  gradeSelect.addEventListener("change", () => {
    updateSubjectSelect(gradeSelect.value);
    resetForGradeChange();
  });
  perfGradeSelect.addEventListener("change", () => {
    updatePerformanceSubjectSelect(perfGradeSelect.value);
  });
  perfSubjectSelect.addEventListener("change", () => {
    updatePerformanceDomainSelect(perfGradeSelect.value, perfSubjectSelect.value);
  });

  settingsForm.addEventListener("submit", handleSubmit);
  combineButton.addEventListener("click", generateCombinedOpinion);
  performanceForm.addEventListener("submit", handlePerformanceSubmit);
  tabOpinionBtn.addEventListener("click", () => setActiveTab("opinion"));
  tabPerformanceBtn.addEventListener("click", () => setActiveTab("performance"));

  resultsContent.addEventListener("click", async (event) => {
    const header = event.target.closest(".accordion-header");
    if (header) {
      const content = header.nextElementSibling;
      const icon = header.querySelector("svg");
      header.classList.toggle("active");
      content.classList.toggle("show");
      if (icon) icon.classList.toggle("rotate-180");
      return;
    }

    const row = event.target.closest(".result-row");
    if (!row || !row.dataset.sentence) return;
    row.classList.toggle("selected");
    const ok = await copyToClipboard(row.dataset.sentence);
    showToast(ok ? "문장이 클립보드에 복사되었습니다!" : "복사에 실패했습니다.");
  });

  combinedResultsContent.addEventListener("click", async (event) => {
    const paragraphBox = event.target.closest(".combined-paragraph-box");
    if (!paragraphBox || !paragraphBox.dataset.paragraph) return;
    paragraphBox.classList.toggle("selected");
    const ok = await copyToClipboard(paragraphBox.dataset.paragraph);
    showToast(ok ? "종합 문단이 클립보드에 복사되었습니다!" : "복사에 실패했습니다.");
  });
}

async function init() {
  try {
    await loadEvaluationPlanData();
    await loadPerformancePlanData();
    updateSubjectSelect(gradeSelect.value);
    perfGradeSelect.innerHTML = gradeSelect.innerHTML;
    perfGradeSelect.value = gradeSelect.value;
    updatePerformanceSubjectSelect(perfGradeSelect.value);
    resultsContent.innerHTML = DEFAULT_HINT_HTML;
    setActiveTab("opinion");
    bindEvents();
  } catch (error) {
    resultsContent.innerHTML = `
      <p class="p-10 text-center text-red-500 bg-white rounded-lg shadow-md border border-red-200">
        데이터 로딩에 실패했습니다. 파일 경로를 확인해주세요. (${error.message})
      </p>
    `;
  }
}

init();
