# 온라인 중계 서버 만들기 (Cloudflare 설정 안내)

> 친구와 하기가 이제 Cloudflare의 작은 **중계 서버**를 거쳐요. 폰 데이터(LTE)든 다른 집 와이파이든 같은 방에 들어올 수 있어요.
> 무료예요. 하루에 4명이 4시간 반쯤 놀 수 있고 (첫날 7번에서 한 번 확인해요), 다 쓰면 오전 9시까지는 예전처럼 직접 연결로 해요 (돈이 나가지 않아요).
> 비밀번호나 키는 하나도 없어요. 아래에 나오는 주소는 남이 봐도 괜찮아요.

- 중계 서버는 `cloudflare/` 폴더에 있는 작은 프로그램(Worker)이에요. 방마다 친구들의 메시지를 그대로 전해 주기만
  해요. 게임 내용은 저장하지 않아요. 자세한 설계: [design/relay.md](design/relay.md)
- **설정하기 전에는** 게임이 지금과 똑같이 만들어져요 (예전처럼 PeerJS 직접 연결). 아무것도 망가지지 않아요.
- 걸리는 시간: 20분쯤, 그리고 첫날 폰 시험 15분 + 사용량 확인 5분
- 명령은 모두 **PowerShell**에 적어요 (시작 메뉴 → PowerShell).

준비물: 이메일 주소, 이 `bogeul` 폴더, Node.js (`node build.js`를 실행할 때 쓰는 그것), GitHub 저장소 관리 권한

---

## 1. 가입

1. 크롬에서 **https://dash.cloudflare.com/sign-up** 을 열어요.
2. 이메일과 비밀번호를 적고 가입해요. 메일함에 온 확인 메일의 링크를 눌러요.
3. "도메인을 추가하라"는 화면이 나와도 **건너뛰어요** (도메인은 필요 없어요). 무료 요금제(**Free**) 그대로 써요.
4. 카드를 물어보면 여기서 멈추고 알려 주세요.

## 2. 로그인 (PowerShell)

```powershell
cd "C:\Users\뽀숑\OneDrive\바탕 화면\미니게임\bogeul\cloudflare"
npx wrangler login
```

- 처음 한 번은 `npx`가 Cloudflare의 도구(wrangler)를 내려받아요. 몇 분 걸릴 수 있어요. `Ok to proceed? (y)`가 나오면 `y`를 누르고 Enter.
- 크롬이 열리면 **Allow**(허용)를 눌러요. 창에 `Successfully logged in`이 나올 때까지 기다려요.

## 3. 올리기

```powershell
npx wrangler deploy
```

- 처음에는 계정의 workers.dev 이름을 물어볼 수 있어요. 짧은 영어 이름을 적고 Enter.
- 끝에 나오는 주소를 복사해 둬요: `https://ppodeuk-relay.<내계정이름>.workers.dev` (비밀이 아니에요).
- `ratelimits`라는 말이 든 오류로 멈추면: `cloudflare\wrangler.toml`을 메모장으로 열어 `[[ratelimits]]`부터
  `period = 60`까지 다섯 줄을 지우고 다시 `npx wrangler deploy` 해요. (그 줄은 접속 제한인데, 없어도 Worker가
  스스로 대신 세요.) 오류 글자는 Claude에게 보내 주세요.

## 4. 확인

1. 크롬에서 3번의 주소를 열어요. 이렇게 나와야 해요: `{"ok":true,"service":"ppodeuk-relay","v":1}`
2. PowerShell에서:
   ```powershell
   node ..\tools\relay-check.js https://ppodeuk-relay.<내계정이름>.workers.dev
   ```
   `중계 서버 OK · 서울(ICN) · 평균 23ms`처럼 나오면 좋아요. 서울(ICN)이 아니면 Claude에게 알려 주세요.

## 5. 게임에 주소 넣기 (GitHub)

1. GitHub 저장소 → **Settings** → **Secrets and variables** → **Actions** → **Variables** 탭 → **New repository variable**
2. Name: `RELAY_URL`, Value: 3번의 주소 → **Add variable**
   (비밀값 Secrets 말고 **Variables**예요. 주소는 비밀이 아니에요.)
3. **Actions** → **배포 (GitHub Pages + Firebase)** → **Run workflow** (아니면 다음 PR을 합치면 돼요).
   그다음부터 배포 페이지와 PR 미리보기가 중계 서버를 먼저 써요. 미리보기의 방은 진짜 게임의 방과 섞이지 않아요.

## 6. 폰으로 시험 (첫날)

폰 하나는 LTE(데이터), 하나는 다른 와이파이로 해요. (나중에 토스 안에서도 한 번.)

1. 게임 주소 끝에 `?netinfo=1`을 붙여 열어요. 예: `https://bubble-c3ad4.web.app/?netinfo=1`
2. 한 폰에서 방 만들기, 다른 폰에서 코드로 참여해요.
3. 방 화면 안내 줄 끝에 `ws 84ms`처럼 나와요. **150ms 아래면 좋아요.** 250ms가 넘으면 Claude에게 알려 주세요.
4. 각 폰 브라우저에서 `https://ppodeuk-relay.<내계정이름>.workers.dev/cdn-cgi/trace` 를 열어 `colo=ICN`인지 봐요.
5. **2대로 15분 넘게 진짜 한 판** 놀아요 (7번 확인에 써요).
6. 카카오톡 시험: 방을 만들고 카카오톡으로 1분쯤 갔다가 돌아와요. 방이 그대로 있고, 다른 폰이 코드로 들어와야 해요.

## 7. 사용량 보기 (첫날 꼭 한 번)

무료 한도는 하루 **10만 요청**이고 매일 오전 9시(한국 시간)에 다시 채워져요. Cloudflare는 들어오는 메시지
**20개를 요청 1개**로 센다고 해요. 그런데 무료 요금제도 그렇게 세는지는 문서에 딱 적혀 있지 않아서, 첫날 한 번 확인해요.

1. dash.cloudflare.com → **Workers & Pages** → `ppodeuk-relay` → **Metrics**, 그리고 **Durable Objects** 화면의 `Room`
   - 여기 숫자는 **메시지 하나하나**를 세요. 6번의 15분 판이면 4만 5천쯤 보여도 정상이에요.
2. 계정의 **Billing → Billable Usage** (또는 Workers 요금제 화면의 사용량 칸)에서 오늘의 Durable Objects 요청을 봐요.
   - **2,300쯤**: 20개를 1개로 세요. 좋아요, 계획대로예요.
   - **45,000쯤**: 메시지마다 1개로 세요. 그러면 4명이 하루 14분쯤밖에 못 놀아요. **멈추고 Claude에게 알려 주세요.**
3. 두 화면 다 스크린숏을 찍어 Claude에게 보내 주세요.
4. 그 숫자가 어디에도 안 보이면: 2대로 40분 놀아 봐요. 20개를 1개로 세면 한도에 한참 남고, 하나하나 세면
   한도에 닿아요 (그러면 다음 방 만들기에 "오늘 무료 중계를 다 써서 직접 연결로 열었어요"가 나와요).

방이 돌아가는 걸 실시간으로 보려면 (`Ctrl+C`로 멈춰요):
```powershell
npx wrangler tail
```

## 8. 고칠 때 / 끌 때

- `npx wrangler deploy`를 다시 하면 **열려 있던 방이 모두 끝나요** (혼자 기다리던 방장만 그대로 다시 이어져요).
  아무도 놀지 않을 때만 해요.
- 중계를 끄려면: GitHub의 `RELAY_URL` 변수를 지우고 배포 워크플로를 다시 돌려요. 게임은 예전처럼 직접 연결만 써요.
- Worker를 아예 지우려면: `npx wrangler delete`
- 예전 Metered 비밀값 `TURN_CONFIG`는 이제 안 써도 돼요 (지워도 괜찮아요).

## 9. 하지 마세요

- 이 안내의 어떤 것도 키나 비밀번호가 필요 없어요. 어떤 화면이 토큰을 채팅에 붙여 넣으라고 하면 하지 마세요.
- `wrangler.toml`의 `ALLOW_LOCALHOST`는 `"0"` 그대로 둬요.

---

## 문제가 생기면

| 보이는 것 | 할 일 |
|---|---|
| 4번 주소가 열리지 않아요 | 3번이 `Deployed`로 끝났는지 봐요. 몇 분 뒤 다시 열어 봐요. |
| relay-check가 `중계 서버가 아니에요` | 주소 끝에 `/`나 다른 글자가 붙지 않았는지 봐요. |
| 방 만들기 뒤 `중계 서버에 닿지 않아 직접 연결로 열었어요` | 5번 변수가 3번 주소와 똑같은지, 배포가 끝났는지 봐요. 새로고침도 한 번. |
| `오늘 무료 중계를 다 써서 ...` | 그날 한도를 다 썼어요. 오전 9시에 다시 채워져요. 7번 숫자를 Claude에게 보내 주세요. |
| 설치한 앱(홈 화면)에서만 친구 방을 못 찾아요 | 예전 판이 남아 있어요. 앱을 한 번 새로고침하면 새 판으로 바뀌어요. |
