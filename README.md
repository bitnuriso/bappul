# 🍚 bappul — 흩어진 파일을 찰싹 붙여두는 동기화 도구

> **Stick once. Keep in sync.**  
> 필요한 파일만 골라, WSL에서 Android Termux로 옮깁니다.

**현재 버전: MVP Phase 2 · 단방향 폴더 동기화 핵심 기능 구현**  
**개발 환경:** NestJS · TypeScript · Node.js 24 · WSL · Android/Termux · SSH/SFTP

`bappul`은 서로 다른 저장소의 파일을 매번 직접 복사해야 하는 번거로움에서 시작한 개인 프로젝트입니다. 장기적으로는 로컬·모바일·외장 저장소를 연결하는 도구를 지향하지만, **현재 MVP는 WSL 폴더 하나와 Termux 폴더 하나를 비교해 변경된 파일만 단방향으로 전송**하는 데 집중합니다.

## ✨ 지금 구현된 기능

| 기능 | 구현 내용 |
| --- | --- |
| **NestJS REST API** | `POST /sync` 요청으로 동기화 실행 |
| **Storage Provider 분리** | 공통 `StorageProvider` 인터페이스와 `LocalProvider`·`SftpProvider` 구현 |
| **재귀적 폴더 탐색** | 하위 디렉터리를 포함한 파일 목록 조회 |
| **선택적 파일 전송** | 상대 경로를 기준으로 신규·변경 파일만 SFTP 전송 |
| **SHA-256 비교** | 크기가 같은 파일의 내용을 해시로 비교해 동일 파일 전송 생략 |
| **기본 충돌 보호** | 원격 파일이 명확히 더 최신인 경우 덮어쓰지 않고 `CONFLICT` 반환 |
| **실행 결과 반환** | 파일별 `SUCCESS`·`SKIPPED`·`CONFLICT`·`FAILED` 상태와 합계 반환 |
| **SSH Agent 인증** | 패스프레이즈를 코드에 저장하지 않고 SFTP 연결 |

**구현 범위:** `WSL → Termux` / 지정된 폴더 한 쌍 / 수동 API 실행 / 동기식 HTTP 응답  
**아직 미구현:** 백그라운드 Job, Retry/Backoff, 실행 이력 영속 저장, 양방향 동기화, 전송 후 해시 검증

## 🏗 아키텍처

```text
                    POST /sync
                         │
                         ▼
                   SyncController
                         │
                         ▼
                     SyncService
                         │
             ┌───────────┴───────────┐
             ▼                       ▼
       LocalProvider            SftpProvider
             │                       │
       WSL 파일 시스템         SSH Agent / SFTP
             │                       │
             └───────────┬───────────┘
                         ▼
             상대 경로 기반 파일 비교
                         │
            ┌────────────┼────────────┐
            ▼            ▼            ▼
          SKIP        TRANSFER      CONFLICT
                         │
                         ▼
                   Termux 저장소
```

### 왜 Provider를 분리했나요?

처음에는 `SyncService`가 SFTP 연결과 파일 전송까지 직접 처리했습니다. 이후 **어떤 파일을 동기화할지 결정하는 로직**과 **저장소에서 파일을 읽고 쓰는 로직**을 분리했습니다.

```ts
interface FileInfo {
  path: string;          // 저장소 루트 기준 상대 경로
  size: number;
  modifiedTime: number;
}

interface StorageProvider {
  list(): Promise<FileInfo[]>;
  read(path: string): Promise<Buffer>;
  write(path: string, data: Buffer): Promise<void>;
}
```

현재는 Local/SFTP 두 구현체를 사용하며, NestJS 의존성 주입에는 구체적인 Provider 클래스를 사용합니다. 새로운 저장소 지원은 **향후 확장 방향**입니다.

## 🔍 변경 파일 판단 방식

1. WSL·Termux의 지정 폴더를 재귀 탐색합니다.
2. 각 파일을 **저장소 루트 기준 상대 경로**로 매칭합니다.
3. 원격 파일이 없으면 전송합니다.
4. 크기가 같으면 **SHA-256 해시**로 실제 내용이 같은지 확인하고, 같으면 건너뜁니다.
5. 내용이 다를 때 원격 파일의 수정 시각이 로컬보다 **1초 초과로 최신**이면 `CONFLICT`로 처리합니다.
6. 그 외 변경 파일을 전송하고 파일별 결과를 반환합니다.

```text
notes/idea.md
   │
   ▼
원격에 존재? ── NO ──────────────→ TRANSFER
   │ YES
   ▼
크기가 같고 해시도 같은가? ── YES → SKIPPED
   │ NO
   ▼
원격 파일이 더 최신인가? ── YES ──→ CONFLICT
   │ NO
   ▼
TRANSFER
```

> **데이터 보호 원칙:** 확신할 수 없는 파일을 무조건 덮어쓰지 않습니다. 다만 현재의 수정 시각 비교는 *기본적인 덮어쓰기 방지 규칙*이며, 양쪽의 변경 이력을 추적하는 완전한 충돌 감지는 아닙니다.

원격 파일을 읽어 SHA-256을 계산하는 방식은 소규모 테스트 폴더에서는 단순하고 확실하지만, **대량 파일·대용량 파일에서는 네트워크 I/O 비용**이 커질 수 있습니다.

## 🚀 실행 및 확인

### 사전 조건

- WSL에서 Node.js 24 및 npm 사용 가능
- Android Termux에 SSH/SFTP 서버 실행 중
- WSL에서 Termux로 접속 가능한 네트워크 환경
- SSH Agent에 인증 키 등록

```bash
npm install
# .env 설정 후
npm run start:dev
```

필요한 설정 항목(예시 값이며 실제 접속 정보가 아닙니다):

```dotenv
LOCAL_ROOT=/path/to/local/folder
SFTP_HOST=YOUR_TERMUX_HOST
SFTP_PORT=8022
SFTP_USERNAME=YOUR_TERMUX_USERNAME
SFTP_ROOT=/path/to/remote/folder
```

`.env`는 Git에 올리지 않습니다. SSH Agent는 서버를 실행할 셸에서 접근할 수 있어야 합니다.

### 동기화 요청

```bash
curl -X POST http://localhost:3000/sync
```

응답에는 `totalFiles`, `transferred`, `skipped`, `conflicts`, `failed` 및 파일별 `results`가 포함됩니다. 아래는 **응답 형태를 보여주는 예시**입니다.

```json
{
  "totalFiles": 3,
  "transferred": 2,
  "skipped": 1,
  "conflicts": 0,
  "failed": 0,
  "results": [
    { "file": "hello.txt", "status": "SKIPPED" },
    { "file": "backend.md", "status": "SUCCESS" },
    { "file": "notes/test.md", "status": "SUCCESS" }
  ]
}
```

**확인할 시나리오:** 최초 실행 시 신규 파일 전송, 같은 폴더 재실행 시 동일 파일 `SKIPPED`, 내용 수정 후 재전송, 원격 파일이 더 최신일 때 `CONFLICT`. 개발 기록상 MVP Phase 2 동기화 동작을 확인했으며, 위 JSON 숫자는 성능 측정값이 아닌 예시입니다.

## 🛠 개발 중 해결한 문제

| 상황 | 원인과 대응 |
| --- | --- |
| NestJS CLI 실행 오류 | 오래된 Node.js 12 환경에서 최신 문법을 처리하지 못해 `nvm`으로 Node.js 24 사용 |
| 암호화된 SSH 개인키 연결 실패 | 개인키를 직접 파싱하는 대신 **SSH Agent 인증**으로 전환 |
| SFTP 연결 타임아웃 | 네트워크 변경 후 `.env`에 남은 이전 Termux IP를 갱신 |
| 불필요한 재전송 | SFTP 전송 후 수정 시간 차이를 고려해 **같은 크기의 파일에 SHA-256 비교** 도입 |
| 파일 검색 비용 | 원격 파일 목록을 상대 경로 키의 `Map`으로 구성해 평균적인 조회 비용 개선 |

## 📁 주요 구조

```text
src/
├── main.ts
├── app.module.ts
├── storage/
│   ├── storage.interface.ts
│   ├── local.provider.ts
│   └── sftp.provider.ts
└── sync/
    ├── sync.controller.ts
    └── sync.service.ts
```

## 🚧 한계와 다음 단계

### 현재 MVP의 한계

- HTTP 요청 중 동기화가 실행되므로 **비동기 Job/상태 조회 API는 아직 없습니다.**
- 전송 중 연결이 끊겼을 때 **자동 재시도나 임시 파일 복구가 없습니다.**
- 결과는 HTTP 응답으로 반환되며 **History 저장은 구현 전**입니다.
- 수정 시각으로 수행하는 충돌 판단은 완전한 양방향 변경 추적이 아닙니다.
- 아직 실제 Obsidian Vault의 상시 동기화 용도로 안정성을 검증하지 않았습니다.

### 가까운 개발 계획

1. 임시 파일 업로드 → 전송 완료 후 해시 검증 → 안전한 교체
2. 파일 단위 Retry / Exponential Backoff
3. 비동기 Sync Job 및 작업 상태 조회
4. 실행 이력 JSON 저장, 처리 시간·전송량 측정

### 장기 구상

`bappul`의 장기 목표는 저장소와 동기화 정책을 분리하고, 필요에 따라 **Mirror·Backup·Archive**, 외장 SSD·WebDAV·Google Drive 등의 Provider, 버전 보존 및 자동 트리거로 확장하는 것입니다. **이 기능들은 현재 MVP에 포함되지 않습니다.**

관련 설계 문서: (추후 공개 예정)

---

**🍚 작은 밥풀부터.** 파일 전체가 아니라 **변경된 파일만 골라 붙이는 것**에서 시작합니다.
