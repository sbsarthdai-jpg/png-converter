# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

주식계산기 — 한국 주식 투자자를 위한 계산기 모음 사이트. 배당금 계산기,
주식 손익률 계산기, 적립식 투자 목표액 계산기 3개 페이지 + 홈으로 구성.

- **기술 스택:** 순수 HTML/CSS/JS (빌드 도구·프레임워크 없음). 이 머신에 Node.js/Python이
  없어서 선택한 스택이며, 파일을 그대로 열거나 정적 서버로 서빙하면 바로 동작한다.
- **개발 서버 실행:** 빌드 단계 없음. `index.html`을 브라우저에서 직접 열거나,
  정적 파일 서버(`python -m http.server`, VS Code Live Server 등)로 루트를 서빙.
- **빌드/테스트:** 없음 (정적 사이트).
- **구조:**
  - `index.html`, `dividend.html`, `profit.html`, `goal.html` — 각 페이지, `<head>`에
    페이지별 title/meta description/favicon 링크를 정적으로 작성.
  - `css/tokens.css` — 디자인 시스템 토큰(색·버튼·폰트·아이콘). **레시피 지정값이므로
    임의로 값을 바꾸지 말 것.**
  - `css/style.css` — 레이아웃/컴포넌트 스타일.
  - `js/components.js` — 헤더/푸터/투자 안내 문구를 각 페이지의 placeholder(`#site-header`,
    `#site-footer`, `[data-disclaimer]`)에 주입하는 공통 스크립트.
  - `js/dividend.js`, `js/profit.js`, `js/goal.js` — 페이지별 계산 로직 (input 이벤트로
    실시간 계산).
  - `assets/favicon.svg` — 사이트 파비콘.
- **주의사항:** 계산기 페이지에는 "이 계산 결과는 참고용이며 투자 조언이 아닙니다"
  안내 문구가 항상 포함되어야 함. 손익률 계산기의 수수료율·증권거래세율은 고정값이 아니라
  사용자가 직접 입력하는 필드(기본값: 수수료 0.015%, 거래세 0.18%)임.

## 배포 규칙

- 배포는 `git push origin main`으로만 한다.
- Netlify CLI, Vercel CLI 등으로 직접 배포하지 않는다.
