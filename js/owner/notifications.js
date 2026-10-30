/* Keep the existing owner-page include while using the shared API-backed bell. */
if (window.PawApi && window.PawApi.isBackendSession()) {
  const notifications = document.createElement("script");
  notifications.src = "../../js/notifications.js";
  document.body.appendChild(notifications);
}
