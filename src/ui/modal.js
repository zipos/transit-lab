import { html } from '../html.js';

let modalReturnFocus = null;
let modalInertState = [];
let pendingConfirm = null;

export function createModal($) {
  function modal(markup) {
    if ($('modal').hidden) {
      modalReturnFocus = document.activeElement;
      modalInertState = [...document.body.children].filter(element => element !== $('modal')).map(element => [element, element.inert]);
      modalInertState.forEach(([element]) => { element.inert = true; });
    }
    $('modal-content').innerHTML = markup;
    const heading = $('modal-content').querySelector('h2');
    if (heading) heading.id = 'modal-title';
    $('modal').hidden = false;
    $('modal-close').focus();
  }

  function closeModal() {
    if ($('modal').hidden) return;
    $('modal').hidden = true;
    modalInertState.forEach(([element, inert]) => { element.inert = inert; });
    modalInertState = [];
    const target = modalReturnFocus;
    modalReturnFocus = null;
    if (pendingConfirm) {
      const resolve = pendingConfirm;
      pendingConfirm = null;
      resolve(false);
    }
    if (target?.isConnected && target.getClientRects().length) target.focus();
  }

  function confirmDialog(message) {
    return new Promise(resolve => {
      pendingConfirm = resolve;
      modal(html`<h2>${message}</h2><div class="toolbar"><button type="button" id="confirm-no">Cancel</button><button type="button" id="confirm-yes" class="primary">Continue</button></div>`);
      $('confirm-yes').focus();
      $('confirm-no').onclick = () => { pendingConfirm = null; closeModal(); resolve(false); };
      $('confirm-yes').onclick = () => { pendingConfirm = null; closeModal(); resolve(true); };
    });
  }

  return { modal, closeModal, confirmDialog };
}
