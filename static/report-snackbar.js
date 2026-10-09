document.querySelectorAll('.message').forEach((message) => {
  let dismissTimer;
  message.setAttribute('role', 'status');
  message.setAttribute('aria-live', 'polite');
  message.setAttribute('aria-atomic', 'true');
  document.body.append(message);

  const showMessage = () => {
    clearTimeout(dismissTimer);
    message.hidden = !message.textContent.trim();
    if (!message.hidden) {
      dismissTimer = setTimeout(() => {
        message.hidden = true;
      }, 7000);
    }
  };

  const observer = new MutationObserver(showMessage);
  observer.observe(message, {
    childList: true,
    characterData: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-state'],
  });
  showMessage();
});