if (location.protocol === 'file:' && /\.(?:md|markdown|mdown|mkd)$/i.test(location.pathname)) {
  void import(chrome.runtime.getURL('modules/content.js'));
}
