## **OCR 번역 크롬 확장 프로그램: 설계 명세서**

### **1. 시스템 아키텍처 명세 (System Architect's View)**

#### **1.1. 컴포넌트 다이어그램 및 역할**

본 시스템은 4개의 핵심 컴포넌트로 구성된 전형적인 Chrome Manifest V3 아키텍처를 따릅니다.

| 컴포넌트 | 파일명 | 역할 및 책임 |
| :--- | :--- | :--- |
| **Service Worker** | `background.js` | **시스템의 두뇌.** 모든 백그라운드 로직 처리. 이미지 캡처 요청 수신, 이미지 데이터 처리(자르기, Base64 변환), LLM API 통신, 클립보드 쓰기, 콜백 스크립트 실행 등 핵심 비즈니스 로직을 담당. 상태 비저장(stateless)으로 동작. |
| **Content Script** | `content.js` | **사용자 인터페이스 담당.** 웹 페이지에 직접 주입되어 UI 상호작용 처리. 우클릭+드래그 감지, 선택 영역 시각화(Overlay), 드래그 좌표 기록 및 Service Worker로 전송. |
| **Options Page** | `options.html` `options.js` `options.css` | **설정 관리.** 사용자가 출발/대상 언어, 용어집, 콜백 스크립트를 설정하고 `chrome.storage`에 저장하는 UI 제공. |
| **Manifest** | `manifest.json` | **확장의 청사진.** 필요한 권한(storage, activeTab, scripting, clipboardWrite), 컴포넌트 등록, 외부 API 접근(host_permissions) 등 확장의 모든 구성을 정의. |

#### **1.2. 데이터 흐름 (Data Flow)**

1.  **`[User]`** 웹 페이지에서 마우스 우클릭 후 드래그 시작.
2.  **`[Content Script]`** `mousedown` 이벤트 감지, 드래그 시작 좌표 (`startX`, `startY`) 기록. `contextmenu` 기본 동작 차단.
3.  **`[Content Script]`** `mousemove` 이벤트에 따라 화면에 반투명 선택 영역(Overlay) 표시.
4.  **`[User]`** 마우스 버튼에서 손을 뗌.
5.  **`[Content Script]`** `mouseup` 이벤트 감지, 드래그 종료 좌표 (`endX`, `endY`) 기록. Overlay 제거.
6.  **`[Content Script]`** `chrome.runtime.sendMessage`를 통해 `{ action: "capture", area: { x, y, width, height } }` 메시지를 Service Worker로 전송.
7.  **`[Service Worker]`** 메시지 수신. `chrome.tabs.captureVisibleTab`을 호출하여 현재 탭의 전체 화면을 캡처.
8.  **`[Service Worker]`** `chrome.storage.sync.get`으로 저장된 설정(언어, 용어집, 콜백) 로드.
9.  **`[Service Worker]`** Offscreen Canvas API를 사용하여 캡처된 전체 이미지에서 `area` 좌표만큼 이미지를 자르고 Base64로 인코딩.
10. **`[Service Worker]`** 설정과 Base64 이미지를 조합하여 LLM API 요청 프롬프트 구성.
11. **`[Service Worker]`** `fetch`를 사용하여 로컬 LLM API(`http://192.168.219.107:1234`) 호출.
12. **`[Service Worker]`** 응답(번역된 텍스트) 수신.
13. **`[Service Worker]`** `navigator.clipboard.writeText`를 사용하여 번역문을 클립보드에 복사.
14. **`[Service Worker]`** `chrome.scripting.executeScript`를 사용하여 현재 활성 탭에 콜백 스크립트 주입 및 실행. 이때 `{ translatedText, startX, ... }` 객체를 인자로 전달.
15. **`[Content Script/Target Page]`** 주입된 콜백 스크립트가 실행됨.

#### **1.3. 확장성 및 유지보수 계획**

*   **느슨한 결합:** 각 컴포넌트는 메시지 패싱(`sendMessage`)과 스토리지(`chrome.storage`)를 통해 통신하므로 독립적으로 수정 및 배포가 용이합니다.
*   **API 추상화:** LLM API 호출 로직은 `background.js` 내의 단일 함수로 캡슐화하여, 향후 다른 LLM API로 교체하거나 요청/응답 형식이 변경될 때 수정 범위를 최소화합니다.
*   **이미지 처리 위임:** 이미지 자르기 및 인코딩은 Service Worker에서 처리하여 Content Script의 부담을 줄이고 페이지 성능 저하를 방지합니다.

### **2. Manifest V3 구성 (`manifest.json`)**

```json
{
  "manifest_version": 3,
  "name": "OCR Translator",
  "version": "1.0",
  "description": "Capture a screen area, OCR and translate it using a local LLM.",
  "permissions": [
    "activeTab",
    "storage",
    "scripting",
    "clipboardWrite"
  ],
  "host_permissions": [
    "http://192.168.219.107:1234/"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "css": ["content.css"]
    }
  ],
  "options_page": "options.html",
  "action": {
    "default_title": "OCR Translator Options",
    "default_popup": "options.html"
  },
  "icons": {
    "16": "images/icon16.svg",
    "48": "images/icon48.svg",
    "128": "images/icon128.svg"
  }
}
```

### **3. 컴포넌트 상세 설계**

#### **3.1. Content Script (`content.js`, `content.css`)**

*   **역할:** 드래그 상호작용 및 좌표 전송.
*   **주요 로직:**
    1.  `isDragging`, `startPos` 변수 선언.
    2.  `mousedown` 리스너:
        *   `event.button === 2` (우클릭)인지 확인.
        *   `isDragging = true`, `startPos = { x: event.clientX, y: event.clientY }`.
        *   `event.preventDefault()` 호출하여 컨텍스트 메뉴 비활성화.
        *   선택 영역을 표시할 `div` (overlay)를 동적으로 생성하여 `body`에 추가.
    3.  `mousemove` 리스너:
        *   `isDragging`이 `true`일 때만 동작.
        *   현재 마우스 좌표와 `startPos`를 기반으로 overlay의 `width`, `height`, `left`, `top` 스타일을 실시간으로 업데이트.
    4.  `mouseup` 리스너:
        *   `isDragging`이 `false`가 아니면 동작 중지.
        *   `isDragging = false`.
        *   `endPos = { x: event.clientX, y: event.clientY }`.
        *   `Math.min/max`를 사용하여 `startPos`와 `endPos`로 사각형 영역(`x`, `y`, `width`, `height`) 계산.
        *   `chrome.runtime.sendMessage`로 계산된 영역과 좌표 전송.
        *   생성했던 overlay `div` 제거.
    5.  `contextmenu` 리스너:
        *   `isDragging` 상태일 때 `event.preventDefault()`를 호출하여 드래그 종료 시 컨텍스트 메뉴가 뜨는 것을 방지.
*   **CSS (`content.css`):**
    *   Overlay `div`에 대한 스타일 정의 (e.g., `position: fixed`, `z-index: 99999`, `border: 2px dashed blue`, `background-color: rgba(0, 100, 255, 0.1)`).

#### **3.2. Service Worker (`background.js`)**

*   **역할:** 핵심 로직 오케스트레이션.
*   **주요 로직:**
    1.  `chrome.runtime.onMessage.addListener`:
        *   `request.action === "capture"` 메시지를 수신하는 리스너 등록.
        *   비동기 처리를 위해 `return true;`를 포함.
    2.  `captureAndTranslate(area, startCoords)` 함수:
        *   `chrome.tabs.captureVisibleTab`으로 현재 탭을 PNG 데이터 URL로 캡처.
        *   `chrome.storage.sync.get`으로 설정(`sourceLang`, `targetLang`, `glossary`, `callbackScript`) 로드.
        *   **이미지 자르기:**
            *   `new Image()` 객체를 생성하고 캡처한 데이터 URL을 `src`에 할당.
            *   `image.onload` 이벤트 내에서 `OffscreenCanvas`를 생성.
            *   `drawImage`를 사용하여 이미지의 `area` 부분만 캔버스에 그림.
            *   `canvas.convertToBlob()` 후 `FileReader`를 사용하여 Base64로 변환.
        *   **LLM 프롬프트 구성:**
            *   설정값과 Base64 이미지를 템플릿에 맞춰 프롬프트 문자열 생성.
        *   **API 호출:**
            *   `try...catch` 블록 내에서 `fetch`로 LLM API 호출.
            *   `method: 'POST'`, `headers: { 'Content-Type': 'application/json' }`, `body: JSON.stringify(...)`.
            *   응답에서 텍스트 추출.
        *   **클립보드 복사 및 콜백 실행:**
            *   `chrome.scripting.executeScript`를 사용하여 `navigator.clipboard.writeText` 실행.
            *   성공 시, `callbackScript`가 존재하면 `chrome.scripting.executeScript`를 다시 호출하여 콜백 실행.
                *   `func`: 콜백 스크립트 문자열을 즉시 실행 함수 `(args) => { ... }` 형태로 래핑.
                *   `args`: `[{ translatedText, ...startCoords, ...endCoords }]` 객체를 배열로 전달.
        *   **에러 처리:** API 호출 실패 또는 콜백 실행 실패 시 `console.error`로 로그 기록.

#### **3.3. Options Page (`options.js`)**

*   **역할:** 사용자 설정 저장 및 로드.
*   **주요 로직:**
    1.  `DOMContentLoaded` 이벤트 리스너:
        *   `chrome.storage.sync.get`으로 저장된 값을 불러와 각 `select`, `textarea`에 채움.
    2.  `save_button.addEventListener('click', ...)`:
        *   각 입력 필드의 값을 가져와 객체로 구성.
        *   `chrome.storage.sync.set`을 사용하여 설정 저장.
        *   저장 완료 후 사용자에게 피드백(e.g., "저장되었습니다" 메시지) 표시.

### **4. API 및 데이터 모델**

#### **4.1. LLM API Request Body**

```json
{
  "model": "local-multimodal-model",
  "messages": [
    {
      "role": "system",
      "content": "당신은 이미지 속 텍스트를 정확히 추출하고, 지정된 언어로 번역하는 전문가입니다.\n규칙:\n1. 이미지에서 모든 텍스트를 추출합니다.\n2. 출발언어가 지정되지 않으면 자동 감지합니다.\n3. 대상언어로 번역합니다. (기본: 繁體中文)\n4. 번역 시 아래 용어집을 반드시 반영합니다.\n5. 출력은 번역문만 제공합니다. 불필요한 설명은 제거합니다."
    },
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "출발언어: {sourceLang or '자동 감지'}\n대상언어: {targetLang or '繁體中文'}\n용어집:\n{glossary}"
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "data:image/png;base64,{imageBase64}"
          }
        }
      ]
    }
  ],
  "stream": false
}
```

#### **4.2. `chrome.storage.sync` 데이터 구조**

```json
{
  "sourceLang": "ja",
  "targetLang": "zh-TW",
  "glossary": "캐릭터1=角色1\n스킬1=技能1",
  "callbackScript": "((args) => { console.log('번역 완료:', args.translatedText); })"
}
```

#### **4.3. 콜백 스크립트 전달 인자 (`args` 객체)**

```javascript
{
  translatedText: "번역된 최종 결과물입니다.",
  startX: 120, // 드래그 시작 X 좌표
  startY: 340, // 드래그 시작 Y 좌표
  endX: 580,   // 드래그 종료 X 좌표
  endY: 620    // 드래그 종료 Y 좌표
}
```

### **5. 구현 로드맵 및 위험 관리**

#### **5.1. 개발 로드맵**

1.  **1단계 (기본 구조):** `manifest.json` 설정, 빈 `background.js`, `content.js`, `options.html` 파일 생성 및 확장 프로그램 로드 확인.
2.  **2단계 (UI 상호작용):** `content.js`에서 드래그 앤 드롭으로 영역 선택 및 Overlay 시각화 기능 구현.
3.  **3단계 (캡처 및 API 연동):** `background.js`에서 메시지를 받아 화면 캡처, 이미지 자르기, Base64 인코딩 및 하드코딩된 프롬프트로 LLM API 호출/응답 확인.
4.  **4단계 (설정 페이지):** `options.html` UI 구현 및 `chrome.storage` 연동.
5.  **5단계 (통합 및 콜백):** `background.js`가 스토리지에서 설정을 읽어와 동적으로 프롬프트를 구성하도록 수정. 클립보드 복사 및 콜백 스크립트 실행 기능 구현.
6.  **6단계 (테스트 및 리팩토링):** 예외 처리(API 실패, 빈 번역 등) 보강, 코드 정리 및 주석 추가.

#### **5.2. 위험 요소 및 완화 전략**

*   **위험:** 로컬 LLM API 응답 지연 또는 실패.
    *   **완화:** `fetch`에 타임아웃 설정 고려. `try...catch`로 API 오류를 명확히 처리하고 `console.error`로 기록. 사용자에게 시각적 피드백(e.g., 브라우저 알림) 제공 고려.
*   **위험:** 콜백 스크립트의 오류가 전체 확장 프로그램에 영향을 줌.
    *   **완화:** 콜백 스크립트 실행을 `try...catch`로 감싸고, 오류 발생 시 `console.error`로 기록하여 디버깅을 돕고 다른 기능에 영향이 없도록 격리.
*   **위험:** 대용량 이미지로 인한 성능 저하 및 API 토큰 초과.
    *   **완화:** 캡처된 이미지의 크기가 특정 임계값(e.g., 2MB)을 초과할 경우, `OffscreenCanvas`에서 리사이징하여 이미지 품질과 성능 사이의 균형을 맞춤.
*   **위험:** CSP(Content Security Policy)로 인해 콜백 스크립트 실행이 차단될 수 있음.
    *   **완화:** `chrome.scripting.executeScript`는 대부분의 CSP를 우회하지만, 일부 극단적인 경우 문제가 될 수 있음. 이는 Manifest V3의 한계로 인지하고, 문제 발생 시 대안(e.g., 사용자에게 결과만 알림)을 고려.