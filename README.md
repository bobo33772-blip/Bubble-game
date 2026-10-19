# 뽀득뽀득 목욕탕

동물 6마리로 혼자·같이 하기·배틀을 즐기는 픽셀 거품 게임 (한국어).

- `src/` 게임 소스 (game.js, sprites.js, page.html, audio.js, net.js, levels.js) · `src/tests/` 자동 테스트
- `tools/` 테스트·점검 도구 · `design/` 설계 문서 · `firebase/` Firestore 보안 규칙
- `node build.js` → `dist/ppogeul-bath.html` (Claude 아티팩트용) · `deploy/` (배포용: 앱 설치, 구글 로그인 저장)
- 구글 로그인 저장 설정: [FIREBASE-SETUP.md](FIREBASE-SETUP.md)

## 업데이트 흐름

1. **브랜치에서 고쳐요**: `main`에 바로 올리지 않고 새 브랜치(예: `fix/거품-속도`)에 커밋해요.
2. **PR을 열어요** (브랜치 → `main`). 그러면 GitHub가 저절로:
   - **테스트**: 게임을 만들고(`node build.js`) 빠른 테스트 묶음을 돌려요 (약 10분). 이게 통과해야 합칠 수 있어요.
   - **미리보기**: PR 번호가 붙은 미리보기 판을 Firebase에 올리고 주소를 PR 댓글로 달아요 (7일 뒤 사라져요).
     화면 구석에 "미리보기 #번호"가 보이고, 기록(트로피·닉네임·점수)은 진짜 게임과 따로 저장돼요.
     Firebase를 연결하기 전(비밀값 `FIREBASE_SERVICE_ACCOUNT`, 변수 `FIREBASE_PROJECT_ID`)에는 실패 없이 건너뛰어요.
3. **미리보기로 직접 해 봐요**. 고칠 게 있으면 같은 브랜치에 더 커밋하면 테스트와 미리보기가 다시 돌아요.
4. **합쳐요** (PR의 "Merge"). `main`에 들어가면 진짜 게임이 저절로 새로 올라가요:
   GitHub Pages (https://bobo33772-blip.github.io/Bubble-game/) + Firebase가 연결돼 있으면 Firebase Hosting.
   Firestore 규칙은 자동으로 올라가지 않아요: 바꿨다면 [FIREBASE-SETUP.md](FIREBASE-SETUP.md) 대로 한 번 올려요.

PC에서 전체 테스트(실시간 온라인 테스트 포함)는 `node tools/run-all.js` 예요. 다른 PC나 리눅스에서는
`PG_CHROME`(크롬 위치)과 `PG_BUILD_TEMP`(임시 폴더)로 기본값(`C:/Program Files/...chrome.exe`, `C:/Temp/bogeul`)을 바꿔요.
