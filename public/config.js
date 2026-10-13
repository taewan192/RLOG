// 광고 계정 승인을 받은 후 실제 발급된 식별자를 입력하세요.
// API 비밀 키는 이 파일에 넣지 마세요. 이 파일은 방문자에게 공개됩니다.
window.RLOG_CONFIG = {
  brand: 'RLOG',
  adsense: { client: '', slots: { top: '', sidebar: '', bottom: '' } },
  // 직접 판매한 배너도 사용 가능합니다. image는 HTTPS 또는 로컬 파일 경로입니다.
  // 예: top: { image: 'assets/sponsor.webp', href: 'https://example.com', alt: '스폰서명' }
  banners: { top: null, sidebar: null, bottom: null }
};
