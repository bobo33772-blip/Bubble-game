# 온라인 중계 서버 바꾸기 (Cloudflare TURN 설정 안내)

친구와 하기에서 **서로 다른 네트워크**(폰 데이터 ↔ 집 와이파이, 다른 집 와이파이끼리)는 기기끼리 바로 연결이 안 될 때가 많아요.
그때는 **중계(TURN) 서버**를 거쳐서 연결돼요. 지금까지 쓰던 Metered 무료 체험(500 MB)은 다 써서 중계가 안 돼요.
이 안내대로 하면 **Cloudflare의 TURN**(매달 1,000 GB 무료)으로 바뀌어요.

- 이번에는 **작은 서버 프로그램(Worker)** 하나를 Cloudflare에 올려요. 게임이 방을 만들거나 들어갈 때마다
  이 Worker에게 "중계 비밀번호"를 받아 와요. 비밀번호는 **2시간만** 쓸 수 있어서, 누가 훔쳐 가도 금방 못 써요.
- **진짜 열쇠(TURN 키)는 Cloudflare 안에만** 있어요. 게임 페이지, 저장소, 채팅 어디에도 들어가지 않아요.
- **돈:** Worker는 무료(하루 10만 번까지), TURN은 매달 1,000 GB까지 무료예요. 그다음은 1 GB에 $0.05예요.
  친구 4명이 한 시간 놀아도 보통 1 GB도 안 돼요 (중계를 거치는 사람만 써요).
- **설정하기 전에는** 게임이 지금과 똑같이 만들어져요. 아무것도 망가지지 않아요.
- 걸리는 시간: 20분쯤

준비물: 이메일 주소, 이 `bogeul` 폴더, Node.js (지금 `node build.js`를 실행할 때 쓰는 그것), GitHub 저장소 관리 권한

> **중요: 키 값(TURN Token ID, API Token)은 채팅(Claude 포함)에 절대 붙여 넣지 마세요.**
> 아래 4번에서 **명령 창에만** 붙여 넣어요. 어디에 적어 두지도 말고, 저장소 파일에도 넣지 마세요.

---

## 1. Cloudflare 가입하기

1. 크롬에서 **https://dash.cloudflare.com/sign-up** 을 열어요.
2. 이메일과 비밀번호를 적고 가입해요. 메일함에 온 확인 메일의 링크를 눌러요.
3. "도메인을 추가하라"는 화면이 나와도 **건너뛰어요** (도메인은 필요 없어요). 무료 요금제(Free) 그대로 써요.

## 2. TURN 키 만들기

1. https://dash.cloudflare.com 왼쪽 메뉴에서 **Realtime**을 눌러요.
   (안 보이면 맨 위 검색창에 `TURN`을 적어요.)
2. **TURN Server** → **Create**(만들기)를 눌러요. 이름은 `ppodeuk-bath`처럼 아무거나 적어요.
3. 만들고 나면 값 두 개가 보여요.
   - **TURN Token ID** (키 ID) - 영어·숫자로 된 긴 글자
   - **API Token** - 더 긴 글자. **이 화면을 닫으면 다시 못 볼 수 있어요.**
4. 이 창은 **열어 둔 채로** 다음으로 가요. (복사는 4번에서 하나씩 해요.)

## 3. 명령 창에서 Cloudflare에 로그인하기 (PowerShell)

1. 시작 메뉴에서 **PowerShell**을 열어요.
2. Worker 폴더로 가요 (내 `bogeul` 폴더 위치에 맞게 바꿔요).
   ```powershell
   cd "C:\Users\뽀숑\OneDrive\바탕 화면\미니게임\bogeul\cloudflare"
   ```
3. 로그인해요. 처음이면 `wrangler`를 설치할지 물어요 → `y` 엔터.
   ```powershell
   npx wrangler login
   ```
   크롬 창이 열리면 **Allow**(허용)를 눌러요. 명령 창에 `Successfully logged in`이 나오면 돼요.

## 4. 키 두 개를 Worker 비밀값으로 넣기

같은 PowerShell 창에서 하나씩 해요. `Enter a secret value:`가 나오면 **2번 화면의 값을 복사해서
마우스 오른쪽 클릭으로 붙여 넣고** 엔터를 눌러요. (붙여 넣은 글자는 화면에 안 보여요. 정상이에요.)

```powershell
npx wrangler secret put TURN_KEY_ID
```
→ **TURN Token ID**를 붙여 넣어요.

```powershell
npx wrangler secret put TURN_KEY_API_TOKEN
```
→ **API Token**을 붙여 넣어요.

처음에는 "아직 Worker가 없는데 만들까요?"라고 물을 수 있어요 → `y` 엔터. 각각 `Success!`가 나오면 돼요.
이제 2번의 Cloudflare 화면은 닫아도 돼요.

## 5. Worker 올리기

```powershell
npx wrangler deploy
```

끝에 이런 주소가 나와요. **이 주소를 복사해 두세요** (비밀이 아니에요).
```
https://ppodeuk-relay.<내계정이름>.workers.dev
```

확인해 봐요.
1. 크롬에서 그 주소를 열면 `{"ok":true,"service":"ppodeuk-relay",...}`가 보여요.
2. 주소 끝에 `/turn`을 붙여 열면 `{"error":"origin",...}`이 나와요. **이게 정상이에요.**
   (게임 페이지에서만 받을 수 있게 막아 둔 거예요.)
3. `bogeul` 폴더에서 중계가 실제로 되는지 확인해요 (크롬이 몰래 열렸다 닫혀요, 10초쯤).
   ```powershell
   cd ..
   node tools/ice-check.js --relay https://ppodeuk-relay.<내계정이름>.workers.dev
   ```
   마지막 줄이 **`ICE OK: relay candidates came back`**이면 성공이에요.
   (키 값은 화면에 나오지 않아요. 서버 주소와 개수만 나와요.)

## 6. GitHub에 Worker 주소 알려 주기

1. GitHub 저장소 **bobo33772-blip/Bubble-game** → 위쪽 **Settings**.
2. 왼쪽 **Secrets and variables** → **Actions** → 위쪽 탭 **Variables** (Secrets 말고 Variables예요).
3. **New repository variable**
   - Name: `RELAY_URL`
   - Value: 5번의 주소 (`https://ppodeuk-relay.<내계정이름>.workers.dev`, 끝에 `/` 없이)
4. **Add variable**.

이제 main에 무엇이든 합쳐지면(또는 **Actions → 배포 (GitHub Pages + Firebase) → Run workflow**) 새 게임 페이지가
올라가요. PR 미리보기 주소도 같이 쓸 수 있어요.

> (다른 방법) 저장소에 `relay.config.json` 파일을 `{"url": "https://ppodeuk-relay.<내계정이름>.workers.dev"}`로
> 올려도 돼요. 주소는 비밀이 아니라서 괜찮아요. 둘 다 있으면 GitHub 변수가 이겨요.

## 7. 잘 되는지 확인하기

1. 배포가 끝나면(Actions 탭에 초록 체크) `bogeul` 폴더에서:
   ```powershell
   node tools/ice-check.js https://bubble-c3ad4.web.app/
   ```
   - `page origin ..., relay https://ppodeuk-relay...` 와 `ICE list from relay`
   - 마지막 줄 **`ICE OK`** 이면 게임 페이지가 Cloudflare 중계를 받고 있어요.
2. 진짜로: 한 명은 **폰 데이터(와이파이 끔)**, 한 명은 **집 와이파이**로 방을 만들고 들어가 봐요.

## 8. 다 되면 정리하기 (나중에)

- 7번까지 잘 되면 GitHub **Settings → Secrets and variables → Actions → Secrets**의 **`TURN_CONFIG`**(Metered)는
  지워도 돼요. 지우면 Worker가 대답을 못 할 때 게임은 중계 없이(직접 연결만) 시도해요.
- 남겨 두면 Worker가 3초 안에 대답을 못 할 때 Metered 목록을 대신 써요 (이미 다 써서 큰 도움은 안 돼요).
- Metered 계정은 쓰지 않으면 그대로 둬도 돼요.

## 9. 문제가 생기면

| 보이는 것 | 이유와 해결 |
|---|---|
| `npx wrangler deploy`가 `ratelimits` 때문에 실패해요 | `cloudflare/wrangler.toml`에서 `[[ratelimits]]`부터 `period = 60`까지 지우고 다시 올려요. 그래도 Worker 안에서 IP마다 1분에 10번으로 막아요. |
| ice-check가 `503 not_configured` | 4번의 비밀값이 안 들어갔어요. 4번을 다시 하고 `npx wrangler deploy`도 다시 해요. |
| ice-check가 `502 upstream (status 401 / 403)` | 키 값이 틀렸어요. 2번에서 새 키를 만들고 4번을 다시 해요. |
| ice-check가 `403 origin` | `--origin`을 바꿨거나 게임 주소가 목록에 없어요. 새 주소는 `wrangler.toml`의 `ALLOWED_ORIGINS`에 넣고 다시 올려요. |
| `429 rate_limited` | 1분에 10번 넘게 물었어요. 1분 기다려요. |
| `ICE NO RELAY`이고 `server error ... 701` | 그 네트워크(회사·학교)가 중계 포트를 막았을 수 있어요. 다른 네트워크(폰 데이터)에서 다시 해 봐요. |
| 페이지 검사에서 `no relay in this build` | 6번의 변수가 없거나, 넣은 뒤에 아직 다시 배포하지 않았어요. |

- 키가 새어 나간 것 같으면: Cloudflare **Realtime → TURN Server**에서 그 키를 지우고 새로 만든 뒤 4번을 다시 해요.
- 사용량은 Cloudflare **Realtime → TURN Server → Analytics**에서 봐요. **Billing → Notifications**에서 알림을 켜 두면 마음이 편해요.

## 10. 알아 두기

- **itch.io에 올린 판**에서는 Worker가 대답하지 않아요 (itch.io는 모든 게임이 한 주소를 같이 써서 막아 뒀어요).
  거기서는 예전처럼 중계 없이 시도해요.
- **Claude에 올린 버전(아티팩트)**은 Claude 방 기능을 써서 이것과 상관없어요.
- 혼자 하기에서는 Worker에 아무것도 묻지 않아요. **친구와 하기**를 열 때 한 번 받아 두고, 2시간 가까이 다시 써요.
- 내 PC에서 Worker를 시험하려면 `wrangler.toml`의 `ALLOW_LOCALHOST = "1"`로 바꿔 올려요. **다 하면 `"0"`으로 되돌려요.**
- 이 Worker에는 나중에 다른 기능(중계 방 `/room/...`)도 같이 들어갈 거예요. 그때도 4~5번처럼 `npx wrangler deploy`만 다시 해요.
