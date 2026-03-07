// scripts/ui/modal.ui.js

const ModalUI = (function () {

  let modalEl = null;

    function open({
        title,
        content,
        onConfirm,
        confirmText = 'Confirm',
        danger = false
        }) {
    close();

    modalEl = document.createElement('div');
    modalEl.className = 'modal-backdrop';

    modalEl.innerHTML = `
        <div class="modal">
            <h3>${title}</h3>
            <div class="modal-body"></div>
            <div class="modal-actions">
            <button class="btn-cancel">Cancel</button>
            <button class="btn-confirm ${danger ? 'danger' : ''}">
                ${confirmText}
            </button>
            </div>
        </div>
        `;

    modalEl.querySelector('.modal-body').appendChild(content);

    modalEl.querySelector('.btn-cancel').onclick = close;
    modalEl.querySelector('.btn-confirm').onclick = () => {
      onConfirm();
      close();
    };

    document.body.appendChild(modalEl);
  }

  function close() {
    if (modalEl) {
      modalEl.remove();
      modalEl = null;
    }
  }

  return { open, close };
  

})();