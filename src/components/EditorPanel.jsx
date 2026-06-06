import React, { useState, useEffect, useRef } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { ItemTypes } from '../ItemTypes';
import CodeBlock from './CodeBlock';
import TextBlock from './TextBlock';

const DraggableBlock = ({ block, index, moveBlock, onUpdateBlock, onDeleteBlock }) => {
  const ref = useRef(null);
  const [{ handlerId }, drop] = useDrop({
    accept: ItemTypes.BLOCK,
    collect(monitor) {
      return {
        handlerId: monitor.getHandlerId(),
      };
    },
    hover(item, monitor) {
      if (!ref.current) {
        return;
      }
      const dragIndex = item.index;
      const hoverIndex = index;

      // Don't replace items with themselves
      if (dragIndex === hoverIndex) {
        return;
      }

      // Determine rectangle on screen
      const hoverBoundingRect = ref.current?.getBoundingClientRect();

      // Get vertical middle
      const hoverMiddleY =
        (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;

      // Determine mouse position
      const clientOffset = monitor.getClientOffset();

      // Get pixels to the top
      const hoverClientY = clientOffset.y - hoverBoundingRect.top;

      // Only perform the move when the mouse has crossed half of the items height
      // When dragging downwards, only move when the cursor is below 50%
      // When dragging upwards, only move when the cursor is above 50%

      // Dragging downwards
      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) {
        return;
      }

      // Dragging upwards
      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) {
        return;
      }

      // Time to actually perform the action
      moveBlock(item.id, dragIndex, hoverIndex);

      // Note: we're mutating the monitor item here!
      // Generally it's better to avoid mutations, but it's good here for the sake of performance
      // to avoid expensive index searches.
      item.index = hoverIndex;
    },
  });

  const [{ isDragging }, drag] = useDrag({
    type: ItemTypes.BLOCK,
    item: () => ({ id: block.id, index }),
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const opacity = isDragging ? 0 : 1;
  drag(drop(ref));

  return (
    <div ref={ref} style={{ opacity }} data-handler-id={handlerId}>
      {block.type === 'text' ? (
        <TextBlock
          block={block}
          onUpdate={onUpdateBlock}
          onDelete={onDeleteBlock}
        />
      ) : block.type === 'code' ? (
        <CodeBlock
          block={block}
          onUpdate={onUpdateBlock}
          onDelete={onDeleteBlock}
        />
      ) : null}
    </div>
  );
};

function EditorPanel({ page, blocks, onCreateBlock, onUpdateBlock, onDeleteBlock, onUpdatePageTitle, onReorderBlock, onExportPage }) {
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(page ? page.title : '');
  const [localBlocks, setLocalBlocks] = useState([]);

  useEffect(() => {
      setLocalBlocks(blocks);
    }, [blocks]);

  useEffect(() => {
    setEditedTitle(page ? page.title : '');
  }, [page]);

  if (!page) {
    return (
      <div className="editor-panel">
        <div className="empty-state">
          <i className="bi bi-file-earmark-text"></i>
          <h4>No page selected</h4>
          <p>Select a page from the list or create a new one to get started.</p>
        </div>
      </div>
    );
  }

  const moveBlock = async (id, dragIndex, hoverIndex) => {
    const draggedBlock = blocks.find(block => block.id === id);
    if (draggedBlock) {
      const reorderedBlocks = Array.from(localBlocks);
      reorderedBlocks.splice(dragIndex, 1);
      reorderedBlocks.splice(hoverIndex, 0, draggedBlock);
      await onReorderBlock(draggedBlock.id, hoverIndex + 1);
      setLocalBlocks(reorderedBlocks);
    }
  };

  return (
    <div className="editor-panel">
      <div className="p-3 border-bottom bg-light sticky-top">
        <div className="d-flex justify-content-between align-items-center">
          <div className="d-flex align-items-center gap-2">
            {isTitleEditing ? (
              <input
                type="text"
                className="form-control form-control-sm"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    onUpdatePageTitle(page.id, editedTitle);
                    setIsTitleEditing(false);
                  }
                }}
              />
            ) : (
              <h4 className="mb-0">{page.title}</h4>
            )}
            {!isTitleEditing ? (
              <button
                className="btn btn-sm btn-outline-secondary"
                onClick={() => setIsTitleEditing(true)}
                title="Edit Page Title"
              >
                <i className="bi bi-pencil"></i>
              </button>
            ) : (
              <div className="d-flex gap-2">
                <button
                  className="btn btn-sm btn-success"
                  onClick={() => {
                    onUpdatePageTitle(page.id, editedTitle);
                    setIsTitleEditing(false);
                  }}
                  title="Save Page Title"
                >
                  <i className="bi bi-check-lg"></i>
                </button>
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => {
                    setEditedTitle(page.title);
                    setIsTitleEditing(false);
                  }}
                  title="Cancel Editing"
                >
                  <i className="bi bi-x-lg"></i>
                </button>
              </div>
            )}
          </div>
          <div className="d-flex gap-2">
            <button
              className="btn btn-sm btn-outline-primary"
              onClick={() => onCreateBlock('text')}
              title="Add text block"
            >
              <i className="bi bi-file-text me-1"></i>
              Text
            </button>
            <button
              className="btn btn-sm btn-outline-primary"
              onClick={() => onCreateBlock('code')}
              title="Add code block"
            >
              <i className="bi bi-code-slash me-1"></i>
              Code
            </button>
            <button
              className="btn btn-sm btn-outline-secondary"
              onClick={onExportPage}
              title="Exporter en Word"
            >
              <i className="bi bi-file-earmark-word"></i>
            </button>
          </div>
        </div>
        <small className="text-muted">
          Last updated: {new Date(page.updated_at).toLocaleString()}
        </small>
      </div>

      <div className="p-3">
        {localBlocks.length === 0 ? (
          <div className="empty-state" style={{ height: 'auto', padding: '60px 20px' }}>
            <i className="bi bi-inbox"></i>
            <h5>No blocks yet</h5>
            <p>Add text or code blocks to start building your page.</p>
          </div>
        ) : (
          localBlocks.map((block, index) => (
            <DraggableBlock
              key={block.id}
              index={index}
              block={block}
              moveBlock={moveBlock}
              onUpdateBlock={onUpdateBlock}
              onDeleteBlock={onDeleteBlock}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default EditorPanel;