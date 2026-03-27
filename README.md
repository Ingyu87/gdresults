# 학기말 종합의견 생성 도우미

Vercel에 바로 배포 가능한 정적 프론트 + 서버리스 API 구조입니다.

## 구조

- `index.html`: 화면 UI
- `data/evaluation-plan.json`: 학년/과목/영역 성취기준 데이터
- `data/performance-plan.json`: PDF 기반 수행평가 요소/방법/기준 구조화 데이터
- `js/app.js`: 화면 로직 및 `/api/generate` 호출
- `api/generate.js`: Gemini API 서버리스 프록시 (환경변수 사용)
- `api/performance-design.js`: 수행평가 설계/평가지 생성 API
- `scripts/build_performance_plan.py`: PDF JSON에서 수행평가 구조화 파일 생성 스크립트

## 로컬 실행

Vercel CLI 사용을 권장합니다.

```bash
npm i -g vercel
vercel dev
```

## Vercel 배포

1. GitHub에 푸시
2. Vercel에서 저장소 Import
3. 프로젝트 설정의 Environment Variables에 아래 키 추가

- `GEMINI_API_KEY`: Google AI Studio Gemini API Key

4. Deploy

## 보안 참고

- API 키는 브라우저에 노출되지 않으며, `api/generate.js`에서만 사용됩니다.
- 프론트는 항상 `/api/generate`를 호출합니다.
