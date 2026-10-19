interface CaptureContents<T> {
  executeJavaScript(script: string): Promise<unknown>;
  capturePage(): Promise<T>;
}

export async function captureBocPage<T>(contents: CaptureContents<T>): Promise<T> {
  try {
    await contents.executeJavaScript(`new Promise((resolve) => {
      const banner = document.getElementById('precheck-rate-banner');
      if (banner) {
        banner.dataset.captureDisplay = banner.style.getPropertyValue('display');
        banner.dataset.capturePriority = banner.style.getPropertyPriority('display');
        banner.style.setProperty('display', 'none', 'important');
      }
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    })`);
    return await contents.capturePage();
  } finally {
    await contents.executeJavaScript(`(() => {
      const banner = document.getElementById('precheck-rate-banner');
      if (banner && Object.hasOwn(banner.dataset, 'captureDisplay')) {
        banner.style.setProperty('display', banner.dataset.captureDisplay, banner.dataset.capturePriority);
        delete banner.dataset.captureDisplay;
        delete banner.dataset.capturePriority;
      }
    })()`);
  }
}
