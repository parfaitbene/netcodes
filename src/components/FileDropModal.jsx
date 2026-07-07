// src/components/FileDropModal.jsx
import React from 'react';

function FileDropModal({ show, filename, onReplace, onAppend, onCancel }) {
  if (!show) return null;

  return (
    <>
      <div
        className="modal fade show"
        style={{ display: 'block' }}
        tabIndex="-1"
        role="dialog"
      >
        <div className="modal-dialog modal-dialog-centered" role="document">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">
                <i className="bi bi-file-earmark-arrow-down me-2"></i>
                Importer «&nbsp;{filename}&nbsp;»
              </h5>
              <button
                type="button"
                className="btn-close"
                onClick={onCancel}
                aria-label="Fermer"
              />
            </div>
            <div className="modal-body">
              Ce bloc contient déjà du contenu. Que souhaitez-vous faire ?
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-danger"
                onClick={onReplace}
              >
                <i className="bi bi-arrow-repeat me-1"></i>
                Remplacer
              </button>
              <button
                className="btn btn-primary"
                onClick={onAppend}
              >
                <i className="bi bi-plus-lg me-1"></i>
                Ajouter à la suite
              </button>
              <button
                className="btn btn-secondary"
                onClick={onCancel}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show"></div>
    </>
  );
}

export default FileDropModal;
