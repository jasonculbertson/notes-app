import React, { useState, useEffect, useRef, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot, collection, deleteDoc, addDoc, Timestamp, getDocs, query } from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from './firebase';

// Main App component
// Simple Rich Text Editor using contentEditable
const createSimpleRichEditor = (container, initialContent, onChange) => {
    const isDarkMode = document.body.classList.contains('dark-mode');
    
    // Clear container
    container.innerHTML = '';
    
    // Undo/Redo management - define early so functions are available
    let undoStack = [];
    let redoStack = [];
    let isUndoRedoOperation = false;
    
    const saveToUndoStack = (content) => {
        if (isUndoRedoOperation) return;
        
        // Don't save if it's the same as the last entry
        if (undoStack.length > 0 && undoStack[undoStack.length - 1] === content) return;
        
        undoStack.push(content);
        // Limit undo stack to 50 operations
        if (undoStack.length > 50) {
            undoStack.shift();
        }
        // Clear redo stack when new content is added
        redoStack = [];
    };
    
    const performUndo = () => {
        if (undoStack.length <= 1) return; // Keep at least one state
        
        const currentContent = editor.innerHTML;
        undoStack.pop(); // Remove current state
        const previousContent = undoStack[undoStack.length - 1]; // Get previous state
        
        if (previousContent !== undefined && previousContent !== currentContent) {
            redoStack.push(currentContent);
            isUndoRedoOperation = true;
            editor.innerHTML = previousContent;
            
            // Update placeholder
            updatePlaceholder();
            
            // Trigger change handler to save
            if (onChange) {
                const isEmpty = !previousContent.trim() || previousContent === '<br>' || previousContent === '<p><br></p>';
                const finalContent = isEmpty ? '' : previousContent;
                onChange(finalContent);
            }
            
            setTimeout(() => {
                isUndoRedoOperation = false;
            }, 100);
            editor.focus();
        }
    };
    
    const performRedo = () => {
        if (redoStack.length === 0) return;
        
        const currentContent = editor.innerHTML;
        const nextContent = redoStack.pop();
        
        if (nextContent !== undefined && nextContent !== currentContent) {
            saveToUndoStack(currentContent);
            isUndoRedoOperation = true;
            editor.innerHTML = nextContent;
            
            // Update placeholder
            updatePlaceholder();
            
            // Trigger change handler to save
            if (onChange) {
                const isEmpty = !nextContent.trim() || nextContent === '<br>' || nextContent === '<p><br></p>';
                const finalContent = isEmpty ? '' : nextContent;
                onChange(finalContent);
            }
            
            setTimeout(() => {
                isUndoRedoOperation = false;
            }, 100);
            editor.focus();
        }
    };
    
    // Style the container
    container.style.cssText = `
        display: flex;
        flex-direction: column;
        height: 100%;
        max-height: calc(100vh - 300px);
        border: none;
        border-radius: 8px;
        background-color: ${isDarkMode ? '#1f2937' : '#ffffff'};
        overflow: hidden;
    `;
    
    // Create toolbar
    const toolbar = document.createElement('div');
    toolbar.style.cssText = `
        display: flex;
        gap: 8px;
        padding: 8px;
        border-bottom: 1px solid #e5e7eb;
        margin-bottom: 12px;
        flex-wrap: wrap;
        background: rgba(0,0,0,0.02);
        border-radius: 6px 6px 0 0;
    `;
    
    // Create toolbar buttons
    const buttons = [
        { text: '↶', command: 'undo', title: 'Undo (Ctrl+Z)' },
        { text: '↷', command: 'redo', title: 'Redo (Ctrl+Y)' },
        { text: 'B', command: 'bold', title: 'Bold (Ctrl+B)' },
        { text: 'I', command: 'italic', title: 'Italic (Ctrl+I)' },
        { text: 'U', command: 'underline', title: 'Underline (Ctrl+U)' },
        { text: 'H1', command: 'formatBlock', value: 'h1', title: 'Heading 1' },
        { text: 'H2', command: 'formatBlock', value: 'h2', title: 'Heading 2' },
        { text: 'H3', command: 'formatBlock', value: 'h3', title: 'Heading 3' },
        { text: '•', command: 'insertUnorderedList', title: 'Bullet List' },
        { text: '1.', command: 'insertOrderedList', title: 'Numbered List' },
        { text: '⇥', command: 'indent', title: 'Indent' },
        { text: '⇤', command: 'outdent', title: 'Outdent' },
        { text: '"', command: 'formatBlock', value: 'blockquote', title: 'Quote' },
        { text: 'P', command: 'formatBlock', value: 'p', title: 'Paragraph' },
        { text: '─', command: 'insertDivider', title: 'Divider' }
    ];
    
    buttons.forEach((btn, index) => {
        // Add a visual separator after undo/redo buttons
        if (index === 2) {
            const separator = document.createElement('div');
            separator.style.cssText = `
                width: 1px;
                height: 20px;
                background-color: #d1d5db;
                margin: 0 4px;
            `;
            toolbar.appendChild(separator);
        }
        
        const button = document.createElement('button');
        button.innerHTML = btn.text;
        button.setAttribute('data-tooltip', btn.title);
        button.style.cssText = `
            padding: 6px 10px;
            border: 1px solid ${isDarkMode ? '#4b5563' : '#d1d5db'};
            background: ${isDarkMode ? '#374151' : 'white'};
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            color: ${isDarkMode ? '#e5e7eb' : '#374151'};
            transition: all 0.2s ease;
            user-select: none;
            position: relative;
        `;
        
        let tooltipTimeout;
        
        button.onmouseover = () => {
            button.style.background = isDarkMode ? '#4b5563' : '#f3f4f6';
            button.style.borderColor = isDarkMode ? '#6b7280' : '#9ca3af';
            button.style.color = isDarkMode ? '#f9fafb' : '#1f2937';
            button.style.transform = 'translateY(-1px)';
            button.style.boxShadow = isDarkMode ? '0 2px 4px rgba(0, 0, 0, 0.3)' : '0 2px 4px rgba(0, 0, 0, 0.1)';
            
            // Show tooltip after a short delay
            tooltipTimeout = setTimeout(() => {
                showTooltip(button);
            }, 500);
        };
        
        button.onmouseout = () => {
            button.style.background = isDarkMode ? '#374151' : 'white';
            button.style.borderColor = isDarkMode ? '#4b5563' : '#d1d5db';
            button.style.color = isDarkMode ? '#e5e7eb' : '#374151';
            button.style.transform = 'translateY(0)';
            button.style.boxShadow = 'none';
            
            // Hide tooltip and clear timeout
            clearTimeout(tooltipTimeout);
            hideTooltip();
        };
        
        button.onmousedown = () => {
            button.style.transform = 'translateY(1px)';
            button.style.boxShadow = 'inset 0 1px 2px rgba(0, 0, 0, 0.2)';
        };
        
        button.onmouseup = () => {
            button.style.transform = 'translateY(-1px)';
            button.style.boxShadow = isDarkMode ? '0 2px 4px rgba(0, 0, 0, 0.3)' : '0 2px 4px rgba(0, 0, 0, 0.1)';
        };
        
        button.onclick = (e) => {
            e.preventDefault();
            editor.focus();
            
            if (btn.command === 'undo') {
                performUndo();
            } else if (btn.command === 'redo') {
                performRedo();
            } else if (btn.command === 'insertDivider') {
                // Save current state before inserting divider
                saveToUndoStack(editor.innerHTML);
                insertDivider();
            } else if (btn.command === 'formatBlock') {
                // Save current state before formatting
                saveToUndoStack(editor.innerHTML);
                insertHeading(btn.value);
            } else if (btn.command === 'insertUnorderedList') {
                // Save current state before inserting list
                saveToUndoStack(editor.innerHTML);
                insertList('ul');
            } else if (btn.command === 'insertOrderedList') {
                // Save current state before inserting list
                saveToUndoStack(editor.innerHTML);
                insertList('ol');
            } else if (btn.value) {
                // Save current state before formatting
                saveToUndoStack(editor.innerHTML);
                document.execCommand(btn.command, false, btn.value);
            } else {
                // Save current state before executing command
                saveToUndoStack(editor.innerHTML);
                document.execCommand(btn.command, false, null);
            }
            editor.focus();
        };
        
        toolbar.appendChild(button);
    });
    
    // Tooltip management
    let activeTooltip = null;
    
    const showTooltip = (button) => {
        hideTooltip(); // Hide any existing tooltip
        
        const tooltipText = button.getAttribute('data-tooltip');
        if (!tooltipText) return;
        
        // Get button position relative to viewport
        const buttonRect = button.getBoundingClientRect();
        
        const tooltip = document.createElement('div');
        tooltip.className = 'custom-tooltip';
        tooltip.textContent = tooltipText;
        tooltip.style.cssText = `
            position: fixed;
            top: ${buttonRect.top - 8}px;
            left: ${buttonRect.left + buttonRect.width / 2}px;
            transform: translate(-50%, -100%);
            background: ${isDarkMode ? '#1f2937' : '#374151'};
            color: ${isDarkMode ? '#f9fafb' : 'white'};
            padding: 6px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 500;
            white-space: nowrap;
            z-index: 10000;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s ease;
        `;
        
        // Add arrow
        const arrow = document.createElement('div');
        arrow.style.cssText = `
            position: absolute;
            top: 100%;
            left: 50%;
            transform: translateX(-50%);
            width: 0;
            height: 0;
            border-left: 4px solid transparent;
            border-right: 4px solid transparent;
            border-top: 4px solid ${isDarkMode ? '#1f2937' : '#374151'};
        `;
        tooltip.appendChild(arrow);
        
        // Append to document body instead of button
        document.body.appendChild(tooltip);
        activeTooltip = tooltip;
        
        // Animate in
        setTimeout(() => {
            if (tooltip.parentNode) {
                tooltip.style.opacity = '1';
            }
        }, 10);
    };
    
    const hideTooltip = () => {
        if (activeTooltip && activeTooltip.parentNode) {
            activeTooltip.style.opacity = '0';
            setTimeout(() => {
                if (activeTooltip && activeTooltip.parentNode) {
                    activeTooltip.parentNode.removeChild(activeTooltip);
                }
                activeTooltip = null;
            }, 200);
        }
    };

    // Helper functions for custom elements
    const insertDivider = () => {
        const dividerHtml = `
            <div class="notion-divider">
                <hr class="notion-divider-line">
            </div>
            <p><br></p>
        `;
        document.execCommand('insertHTML', false, dividerHtml);
    };
    
    const insertHeading = (headingType) => {
        const selection = window.getSelection();
        const range = selection.getRangeAt(0);
        
        // Get the current line/block element
        let currentElement = range.commonAncestorContainer;
        if (currentElement.nodeType === Node.TEXT_NODE) {
            currentElement = currentElement.parentElement;
        }
        
        // Find the closest block element
        while (currentElement && currentElement !== editor && 
               !['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'DIV', 'BLOCKQUOTE'].includes(currentElement.tagName)) {
            currentElement = currentElement.parentElement;
        }
        
        if (currentElement && currentElement !== editor) {
            // Get the text content
            const textContent = currentElement.textContent || '';
            
            // Create new heading element
            const newElement = document.createElement(headingType.toUpperCase());
            newElement.textContent = textContent || 'Heading';
            
            // Replace the current element
            currentElement.parentNode.replaceChild(newElement, currentElement);
            
            // Set cursor at the end of the new heading
            const newRange = document.createRange();
            newRange.selectNodeContents(newElement);
            newRange.collapse(false);
            selection.removeAllRanges();
            selection.addRange(newRange);
        } else {
            // No current block element, insert a new heading
            const headingHtml = `<${headingType.toUpperCase()}>Heading</${headingType.toUpperCase()}><p><br></p>`;
            document.execCommand('insertHTML', false, headingHtml);
        }
    };
    
    const insertList = (listType) => {
        const selection = window.getSelection();
        const range = selection.getRangeAt(0);
        
        // Get the current line/block element
        let currentElement = range.commonAncestorContainer;
        if (currentElement.nodeType === Node.TEXT_NODE) {
            currentElement = currentElement.parentElement;
        }
        
        // Find the closest block element
        while (currentElement && currentElement !== editor && 
               !['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'DIV', 'BLOCKQUOTE', 'LI'].includes(currentElement.tagName)) {
            currentElement = currentElement.parentElement;
        }
        
        if (currentElement && currentElement !== editor) {
            // Get the text content
            const textContent = currentElement.textContent || '';
            
            // Create new list element
            const listElement = document.createElement(listType.toUpperCase());
            const listItem = document.createElement('LI');
            listItem.textContent = textContent || 'List item';
            listElement.appendChild(listItem);
            
            // Replace the current element
            currentElement.parentNode.replaceChild(listElement, currentElement);
            
            // Set cursor at the end of the list item
            const newRange = document.createRange();
            newRange.selectNodeContents(listItem);
            newRange.collapse(false);
            selection.removeAllRanges();
            selection.addRange(newRange);
        } else {
            // No current block element, insert a new list
            const listHtml = listType === 'ul' 
                ? `<ul><li>List item</li></ul><p><br></p>`
                : `<ol><li>List item</li></ol><p><br></p>`;
            document.execCommand('insertHTML', false, listHtml);
        }
    };
    
    // Create editor
    const editor = document.createElement('div');
    editor.contentEditable = true;
    editor.className = 'simple-rich-editor';
    editor.style.cssText = `
        flex: 1;
        padding: 16px;
        border: none;
        outline: none !important;
        font-family: inherit;
        font-size: 16px;
        line-height: 1.6;
        color: inherit;
        background: transparent;
        overflow-y: auto;
        min-height: 0;
    `;
    
    // Set initial content
    if (initialContent && initialContent.trim() && initialContent !== '<p>Start writing your note...</p>') {
        editor.innerHTML = initialContent;
        // Save initial content to undo stack
        saveToUndoStack(initialContent);
    } else {
        editor.innerHTML = '';
        // Save empty state to undo stack
        saveToUndoStack('');
    }
    
    // Add placeholder functionality (defined early for undo/redo)
    const updatePlaceholder = () => {
        const isEmpty = !editor.innerHTML.trim() || editor.innerHTML === '<br>' || editor.innerHTML === '<p><br></p>';
        if (isEmpty) {
            editor.setAttribute('data-placeholder', 'Start writing your note...');
        } else {
            editor.removeAttribute('data-placeholder');
        }
    };
    
    // Set initial placeholder
    updatePlaceholder();
    
    // Add focus styles and placeholder handling
    editor.onfocus = () => {
        // Remove placeholder when focusing
        editor.removeAttribute('data-placeholder');
        
        // If editor is empty, set up for typing
        const isEmpty = !editor.innerHTML.trim() || editor.innerHTML === '<br>' || editor.innerHTML === '<p><br></p>';
        if (isEmpty) {
            editor.innerHTML = '<p><br></p>';
            const range = document.createRange();
            const selection = window.getSelection();
            range.setStart(editor.firstChild, 0);
            range.setEnd(editor.firstChild, 0);
            selection.removeAllRanges();
            selection.addRange(range);
        }
    };
    
    editor.onblur = () => {
        // Only show placeholder if editor is actually empty
        const isEmpty = !editor.innerHTML.trim() || editor.innerHTML === '<br>' || editor.innerHTML === '<p><br></p>';
        if (isEmpty) {
            editor.setAttribute('data-placeholder', 'Start writing your note...');
        }
    };
    
    // Handle content changes with debouncing
    let changeTimeout;
    const handleChange = () => {
        if (changeTimeout) {
            clearTimeout(changeTimeout);
        }
        
        changeTimeout = setTimeout(() => {
            if (onChange) {
                const content = editor.innerHTML;
                const isEmpty = !content.trim() || content === '<br>' || content === '<p><br></p>';
                const finalContent = isEmpty ? '' : content;
                onChange(finalContent);
                
                // Save to undo stack (but not during undo/redo)
                if (!isUndoRedoOperation) {
                    saveToUndoStack(finalContent);
                }
            }
        }, 500); // 500ms debounce
    };
    
    editor.oninput = handleChange;
    editor.onpaste = handleChange;
    
    // Handle keyboard shortcuts
    editor.onkeydown = (e) => {
        if (e.ctrlKey || e.metaKey) {
            switch(e.key.toLowerCase()) {
                case 'b':
                    e.preventDefault();
                    document.execCommand('bold');
                    break;
                case 'i':
                    e.preventDefault();
                    document.execCommand('italic');
                    break;
                case 'u':
                    e.preventDefault();
                    document.execCommand('underline');
                    break;
                case 'z':
                    e.preventDefault();
                    if (e.shiftKey) {
                        // Ctrl/Cmd+Shift+Z = Redo
                        performRedo();
                    } else {
                        // Ctrl/Cmd+Z = Undo
                        performUndo();
                    }
                    break;
                case 'y':
                    e.preventDefault();
                    // Ctrl/Cmd+Y = Redo (alternative shortcut)
                    performRedo();
                    break;
                default:
                    // Other shortcuts will use default browser behavior
                    break;
            }
        }
    };
    
    // Append to container
    container.appendChild(toolbar);
    container.appendChild(editor);
    
    // Store reference for cleanup and prevent recreation
    container._richEditor = { 
        toolbar, 
        editor, 
        isInitialized: true,
        handleChange: handleChange, // Expose the handleChange function
        getHtml: () => {
            return editor ? editor.innerHTML : '';
        },
        setHtml: (htmlContent) => {
            if (editor) {
                editor.innerHTML = htmlContent || '';
                updatePlaceholder();
                // Save to undo stack
                saveToUndoStack(htmlContent || '');
            }
        },
        updateContent: (newContent) => {
            if (editor) {
                // Save current cursor position
                const selection = window.getSelection();
                let cursorPosition = 0;
                let restoreCursor = false;
                
                if (selection.rangeCount > 0 && editor.contains(selection.anchorNode)) {
                    restoreCursor = true;
                    const range = selection.getRangeAt(0);
                    cursorPosition = range.startOffset;
                    
                    // Create a temporary element to calculate text offset
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = editor.innerHTML;
                    
                    // Find the text offset position
                    let textOffset = 0;
                    const walker = document.createTreeWalker(
                        editor,
                        NodeFilter.SHOW_TEXT,
                        null,
                        false
                    );
                    
                    let node;
                                                while ((node = walker.nextNode())) {
                        if (node === selection.anchorNode) {
                            textOffset += cursorPosition;
                            break;
                        }
                        textOffset += node.textContent.length;
                    }
                    cursorPosition = textOffset;
                }
                
                // Only update if content has actually changed
                const currentContent = editor.innerHTML;
                const normalizedNewContent = newContent || '';
                
                if (currentContent !== normalizedNewContent) {
                    editor.innerHTML = normalizedNewContent;
                    
                    // Restore cursor position
                    if (restoreCursor && normalizedNewContent) {
                        try {
                            const walker = document.createTreeWalker(
                                editor,
                                NodeFilter.SHOW_TEXT,
                                null,
                                false
                            );
                            
                            let node;
                            let currentOffset = 0;
                            let targetNode = null;
                            let targetOffset = 0;
                            
                            while ((node = walker.nextNode())) {
                                const nodeLength = node.textContent.length;
                                if (currentOffset + nodeLength >= cursorPosition) {
                                    targetNode = node;
                                    targetOffset = cursorPosition - currentOffset;
                                    break;
                                }
                                currentOffset += nodeLength;
                            }
                            
                            if (targetNode) {
                                const range = document.createRange();
                                const selection = window.getSelection();
                                range.setStart(targetNode, Math.min(targetOffset, targetNode.textContent.length));
                                range.collapse(true);
                                selection.removeAllRanges();
                                selection.addRange(range);
                            }
                        } catch (error) {
                            console.log('Could not restore cursor position:', error);
                            // Fallback: focus the editor
                            editor.focus();
                        }
                    }
                }
                
                // Update placeholder
                const isEmpty = !normalizedNewContent || normalizedNewContent.trim() === '' || normalizedNewContent === '<br>' || normalizedNewContent === '<p><br></p>';
                if (isEmpty) {
                    editor.setAttribute('data-placeholder', 'Start writing your note...');
                } else {
                    editor.removeAttribute('data-placeholder');
                }
                
                // Save to undo stack only if content actually changed
                if (currentContent !== normalizedNewContent) {
                    saveToUndoStack(normalizedNewContent);
                }
            }
        },
        cleanup: () => {
            // No cleanup needed currently since auto-save is disabled
        }
    };
};

const App = () => {
    // State variables for Firebase and authentication
    const [db, setDb] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [appId, setAppId] = useState(null);

    // State variables for application data
    const [documents, setDocuments] = useState([]); // List of document metadata { id, title, content, tags, parentId, order }
    const [documentTree, setDocumentTree] = useState([]); // Hierarchical tree structure of documents
    const [expandedNodes, setExpandedNodes] = useState(new Set()); // Track which nodes are expanded
    const [draggedNode, setDraggedNode] = useState(null); // Currently dragged node
    const [dropTarget, setDropTarget] = useState(null); // Current drop target
    const [dropPosition, setDropPosition] = useState(null); // 'before', 'after', or 'inside'
    const [currentDocumentId, setCurrentDocumentId] = useState(null);
    const [currentDocumentContent, setCurrentDocumentContent] = useState(''); // Content is now HTML string
    const [currentDocumentTitle, setCurrentDocumentTitle] = useState('');
    const [currentDocumentTags, setCurrentDocumentTags] = useState([]); // State for tags of the current document

    const [llmResponse, setLlmResponse] = useState('');
    const [llmLoading, setLlmLoading] = useState(false);
    const [llmLoadingMessage, setLlmLoadingMessage] = useState('');
    const [suggestedTitles, setSuggestedTitles] = useState([]);
    const [isLoadingTitleSuggestions, setIsLoadingTitleSuggestions] = useState(false);
    const [llmQuestion, setLlmQuestion] = useState('');
    const [saveStatus, setSaveStatus] = useState('All changes saved'); // New state for save status
    const [chatHistory, setChatHistory] = useState([]); // Store conversation history
    const [externalSearchSuggestions, setExternalSearchSuggestions] = useState([]); // External search suggestions

    // New states for added features
    const [searchTerm, setSearchTerm] = useState(''); // State for document search query
    const [isDarkMode, setIsDarkMode] = useState(false); // State for dark mode toggle
    const [showTemplateMenu, setShowTemplateMenu] = useState(false); // State to control template menu visibility
    const [showSidebarMobile, setShowSidebarMobile] = useState(false); // Mobile: sidebar visibility
    const [showLlmMobile, setShowLlmMobile] = useState(false); // Mobile: LLM panel visibility
    const [rightPanelWidth, setRightPanelWidth] = useState(25); // Right panel width as percentage (default 25%)
    const [suggestedTags, setSuggestedTags] = useState([]); // AI-suggested tags
    const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false); // Loading state for tag suggestions

    // Custom Icons and Cover Images states
    const [currentDocumentIcon, setCurrentDocumentIcon] = useState('');
    const [currentDocumentCoverImage, setCurrentDocumentCoverImage] = useState('');
    const [showIconPicker, setShowIconPicker] = useState(false);
    const [iconSearchTerm, setIconSearchTerm] = useState('');
    const [activeIconCategory, setActiveIconCategory] = useState('Smileys');
    const [isUploadingCover, setIsUploadingCover] = useState(false);
    const [uploadProgress, setUploadProgress] = useState('');

    // UI state management
    const [openOverflowMenu, setOpenOverflowMenu] = useState(null); // Track which node's overflow menu is open

    // Feature 1: AI Content Transformation - State Management
    const [aiTransformToolbar, setAiTransformToolbar] = useState({
        visible: false,
        x: 0,
        y: 0,
        selectedText: '',
        selectedRange: null
    });
    const [aiTransformLoading, setAiTransformLoading] = useState(false);
    const [aiTransformLoadingMessage, setAiTransformLoadingMessage] = useState('');

    // Feature 2: Internal Linking & Backlinks - State Management
    const [linkAutocomplete, setLinkAutocomplete] = useState({
        visible: false,
        x: 0,
        y: 0,
        searchTerm: '',
        suggestions: [],
        selectedIndex: 0,
        range: null
    });
    const [documentBacklinks, setDocumentBacklinks] = useState([]);
    const [allDocumentTitles, setAllDocumentTitles] = useState([]);

    // File Management States - Phase 1: File Upload
    const [uploadedFiles, setUploadedFiles] = useState([]);
    const [isUploadingFile, setIsUploadingFile] = useState(false);
    const [fileUploadProgress, setFileUploadProgress] = useState('');
    const [showFilesSection, setShowFilesSection] = useState(true);
    
    // Phase 2: File Content Analysis
    const [isProcessingFileContent, setIsProcessingFileContent] = useState(false);
    const [fileContentProcessingProgress, setFileContentProcessingProgress] = useState('');
    
    // File Management States - Phase 2: Google Links
    const [googleLinks, setGoogleLinks] = useState([]);
    const [showAddGoogleLinkModal, setShowAddGoogleLinkModal] = useState(false);
    const [googleLinkTitle, setGoogleLinkTitle] = useState('');
    const [googleLinkUrl, setGoogleLinkUrl] = useState('');
    const [showGoogleLinksSection, setShowGoogleLinksSection] = useState(true);

    // ChatGPT-style Plus Button Overlay State
    const [showPlusOverlay, setShowPlusOverlay] = useState(false);
    const [showGoogleDriveOptions, setShowGoogleDriveOptions] = useState(false);

    // Phase 4: User Confirmation Modals State
    const [showConfirmationModal, setShowConfirmationModal] = useState(false);
    const [pendingAction, setPendingAction] = useState(null);
    const [previewContent, setPreviewContent] = useState('');
    const [confirmationTitle, setConfirmationTitle] = useState('');
    const [confirmationMessage, setConfirmationMessage] = useState('');
    const [isEditingPreview, setIsEditingPreview] = useState(false);
    const [editedPreviewContent, setEditedPreviewContent] = useState('');

    // Phase 5: UI Cleanup - New AI Title & Icon Suggestions State
    const [aiTitleIconSuggestions, setAiTitleIconSuggestions] = useState([]); // Stores [{ title: '...', icon: '...' }, ...]
    const [showAiTitleSuggestions, setShowAiTitleSuggestions] = useState(false); // Optional granular control

    // Phase 5: UI Cleanup - New AI Tag Suggestions State
    const [aiTagSuggestions, setAiTagSuggestions] = useState([]); // Stores ['tag1', 'tag2', ...]

    // Refs
    const tagInputContainerRef = useRef(null); // To detect clicks outside for tag suggestions

    // Phase 5: Transient behavior for AI tag suggestions
    useEffect(() => {
        if (aiTagSuggestions.length > 0) {
            const timer = setTimeout(() => {
                setAiTagSuggestions([]); // Clear after a delay
            }, 10000); // Disappear after 10 seconds

            return () => clearTimeout(timer); // Clear timeout on unmount or re-trigger
        }
    }, [aiTagSuggestions]);

    // Handle text selection for contextual Q&A and AI Transformation - Moved early to avoid hoisting issues
    const handleTextSelection = useCallback(() => {
        console.log("Text selection handler triggered");
        
        // Small delay to ensure selection is finalized
        setTimeout(() => {
            const selection = window.getSelection();
            const selectedTextContent = selection.toString().trim();
            
            console.log("Selected text:", selectedTextContent, "Length:", selectedTextContent.length);
            
            if (selectedTextContent.length > 3 && selection.rangeCount > 0) { // Require at least 3 characters
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                
                // Check if the selection is visible and has dimensions
                if (rect.width > 0 && rect.height > 0) {
                    // Check if selection is within the editor area
                    const editorElement = editorElementRef.current;
                    if (editorElement) {
                        const selectionContainer = range.commonAncestorContainer;
                        
                        // More robust check for whether selection is within editor
                        const isWithinEditor = editorElement.contains(selectionContainer) || 
                            (selectionContainer.nodeType === Node.TEXT_NODE && 
                             editorElement.contains(selectionContainer.parentNode)) ||
                            // Also check if any part of the range intersects with editor
                            editorElement.contains(range.startContainer) ||
                            editorElement.contains(range.endContainer);
                        
                        if (isWithinEditor) {
                            console.log("Valid selection within editor detected");
                            
                            // Feature 1: AI Transformation Toolbar - Show with delay to avoid flicker
                            setTimeout(() => {
                                // Double-check selection is still valid
                                const currentSelection = window.getSelection();
                                if (currentSelection.toString().trim().length > 3) {
                                    const currentRange = currentSelection.rangeCount > 0 ? currentSelection.getRangeAt(0) : null;
                                    if (currentRange) {
                                        const currentRect = currentRange.getBoundingClientRect();
                                        setAiTransformToolbar({
                                            visible: true,
                                            x: currentRect.left + (currentRect.width / 2) - 100, // Center toolbar (assuming ~200px width)
                                            y: currentRect.top - 40, // Position above selection
                                            selectedText: currentSelection.toString().trim(),
                                            selectedRange: currentRange.cloneRange() // Store a copy of the range
                                        });
                                    }
                                }
                            }, 200); // 200ms delay to prevent flicker
                            
                            console.log("Showing AI toolbar at position:", {
                                x: rect.left + (rect.width / 2),
                                y: rect.top - 40
                            });
                            return;
                        } else {
                            console.log("Selection not within editor area");
                        }
                    }
                } else {
                    console.log("Selection has no visible dimensions");
                }
            } else {
                console.log("Selection too short or no range:", selectedTextContent.length);
            }
            
            // Hide AI toolbar if no valid selection
            setAiTransformToolbar(prev => ({ ...prev, visible: false }));
        }, 50); // Slightly longer delay to ensure selection is complete
    }, []); // No dependencies needed since we're using state setters directly

    // Helper function to convert HTML to plain text
    const convertHtmlToPlainText = useCallback((html) => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        return doc.body.textContent || "";
    }, []);

    // Helper function to convert HTML/text to Editor.js format (currently unused)
    // eslint-disable-next-line no-unused-vars
    const convertToEditorFormat = useCallback((content) => {
        if (!content) return { blocks: [] };
        
        // If it's already Editor.js format, return as is
        try {
            const parsed = JSON.parse(content);
            if (parsed.blocks) {
                console.log('Content is already in Editor.js format, returning as-is');
                return parsed;
            }
        } catch (e) {
            console.log('Content is not JSON, converting from HTML/text');
        }

        const blocks = [];
        
        // Simple conversion from HTML/text to Editor.js blocks
        if (content.includes('<')) {
            // HTML content - simple conversion
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = content;
            
            const elements = tempDiv.children.length > 0 ? Array.from(tempDiv.children) : [tempDiv];
            
            for (const element of elements) {
                const tagName = element.tagName?.toLowerCase();
                const text = element.textContent || element.innerText || '';
                
                if (!text.trim()) continue;
                
                switch (tagName) {
                    case 'h1':
                        blocks.push({ type: 'header', data: { text, level: 1 } });
                        break;
                    case 'h2':
                        blocks.push({ type: 'header', data: { text, level: 2 } });
                        break;
                    case 'h3':
                        blocks.push({ type: 'header', data: { text, level: 3 } });
                        break;
                    case 'ul':
                        const listItems = Array.from(element.querySelectorAll('li')).map(li => li.textContent);
                        blocks.push({ type: 'list', data: { style: 'unordered', items: listItems } });
                        break;
                    case 'ol':
                        const orderedItems = Array.from(element.querySelectorAll('li')).map(li => li.textContent);
                        blocks.push({ type: 'list', data: { style: 'ordered', items: orderedItems } });
                        break;
                    case 'blockquote':
                        blocks.push({ type: 'quote', data: { text, caption: '' } });
                        break;
                    default:
                        blocks.push({ type: 'paragraph', data: { text } });
                }
            }
        } else {
            // Plain text - split by lines
            const lines = content.split('\n').filter(line => line.trim());
            for (const line of lines) {
                blocks.push({ type: 'paragraph', data: { text: line.trim() } });
            }
        }
        
        return { blocks };
    }, []);

    // Helper function to convert Editor.js data to plain text
    const convertEditorToPlainText = useCallback((editorData) => {
        if (!editorData || !editorData.blocks) return '';
        
        return editorData.blocks.map(block => {
            switch (block.type) {
                case 'header':
                    return block.data.text || '';
                case 'paragraph':
                    return block.data.text || '';
                case 'list':
                    return (block.data.items || []).join('\n');
                case 'quote':
                    return block.data.text || '';
                case 'code':
                    return block.data.code || '';
                case 'checklist':
                    return (block.data.items || []).map(item => item.text).join('\n');
                default:
                    return '';
            }
        }).filter(text => text.trim()).join('\n\n');
    }, []);

    // Helper function to sanitize HTML content for security
    const sanitizeHtml = useCallback((htmlString) => {
        if (!htmlString) return '';
        
        if (!window.DOMPurify) {
            console.warn("DOMPurify not loaded. HTML content is not being sanitized!");
            return htmlString; // Fallback, but dangerous
        }
        
        // Configure allowed tags and attributes
        const cleanHtml = window.DOMPurify.sanitize(htmlString, {
            USE_PROFILES: { html: true }, // Use default HTML profile
            ALLOWED_TAGS: [
                'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u',
                'a', 'span', 'div', 'br', 'hr', 'blockquote',
                'pre', 'code', 'img'
            ],
            ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class'],
            FORBID_TAGS: ['script', 'iframe', 'style', 'object', 'embed'],
            FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'style']
        });
        
        return cleanHtml;
    }, []);

    // Helper function to convert Editor.js JSON to HTML for rich text editor
    const convertEditorJsonToHtml = useCallback((content) => {
        if (!content) return '';
        
        // If it's already HTML, return as is
        if (typeof content === 'string' && !content.startsWith('{')) {
            return content;
        }
        
        // Try to parse as Editor.js JSON
        try {
            const editorData = typeof content === 'string' ? JSON.parse(content) : content;
            
            if (!editorData.blocks || editorData.blocks.length === 0) {
                return '<p>Start writing...</p>';
            }
            
            return editorData.blocks.map(block => {
                switch (block.type) {
                    case 'header':
                        const level = block.data.level || 2;
                        return `<h${level}>${block.data.text || ''}</h${level}>`;
                    case 'paragraph':
                        return `<p>${block.data.text || ''}</p>`;
                    case 'list':
                        const listType = block.data.style === 'ordered' ? 'ol' : 'ul';
                        const items = (block.data.items || []).map(item => {
                            const itemText = typeof item === 'string' ? item : (item.content || item.text || '');
                            return `<li>${itemText}</li>`;
                        }).join('');
                        return `<${listType}>${items}</${listType}>`;
                    case 'quote':
                        return `<blockquote>${block.data.text || ''}</blockquote>`;
                    case 'code':
                        return `<pre style="background: #f4f4f4; padding: 12px; border-radius: 4px; font-family: monospace;"><code>${block.data.code || ''}</code></pre>`;
                    case 'checklist':
                        return (block.data.items || []).map(item => 
                            `<p><input type="checkbox" ${item.checked ? 'checked' : ''} disabled> ${item.text || ''}</p>`
                        ).join('');
                    case 'delimiter':
                        return '<hr>';
                    default:
                        return `<p>${JSON.stringify(block.data)}</p>`;
                }
            }).join('');
            
        } catch (error) {
            console.log('Content is not valid Editor.js JSON, treating as plain text');
            return `<p>${content}</p>`;
        }
    }, []);

    // LLM Function Calling - Phase 1: Core HTML Content Functions
    const createNewDocument = useCallback(async (title, htmlContent, tags = []) => {
        if (!db || !userId || !appId) {
            console.error("Cannot create document: missing db, userId, or appId");
            return { success: false, error: "Database not initialized" };
        }
        
        try {
            // Sanitize the HTML content
            const sanitizedContent = sanitizeHtml(htmlContent);
            
            // Create new document
            const newDocRef = doc(collection(db, `artifacts/${appId}/users/${userId}/notes`));
            const newDoc = {
                title: title || 'AI Generated Document',
                content: sanitizedContent,
                tags: tags || [],
                createdAt: new Date(),
                updatedAt: new Date(),
                parentId: null,
                order: Date.now()
            };
            
            await setDoc(newDocRef, newDoc);
            
            // Update local state
            const newDocumentData = { id: newDocRef.id, ...newDoc };
            setDocuments(prev => [...prev, newDocumentData]);
            
            // Switch to the new document
            setCurrentDocumentId(newDocRef.id);
            
            console.log("✅ Created new document:", newDocRef.id);
            return { 
                success: true, 
                documentId: newDocRef.id,
                message: `Created new document: "${title}"`
            };
        } catch (error) {
            console.error("Error creating new document:", error);
            return { success: false, error: error.message };
        }
    }, [db, userId, appId, sanitizeHtml]);
    
    const appendContentToDocument = useCallback(async (htmlContentToAppend, documentId = null) => {
        const targetDocId = documentId || currentDocumentId;
        
        if (!db || !userId || !appId || !targetDocId) {
            console.error("Cannot append content: missing required parameters");
            return { success: false, error: "Missing required parameters" };
        }
        
        try {
            // Sanitize the HTML content to append
            const sanitizedContent = sanitizeHtml(htmlContentToAppend);
            
            // Get current document content
            const docRef = doc(db, `artifacts/${appId}/users/${userId}/notes`, targetDocId);
            const docSnap = await getDoc(docRef);
            
            if (!docSnap.exists()) {
                return { success: false, error: "Document not found" };
            }
            
            const currentData = docSnap.data();
            let existingContent = currentData.content || '';
            
            // Handle format detection for existing content
            if (existingContent && typeof existingContent === 'string') {
                try {
                    const parsedContent = JSON.parse(existingContent);
                    if (parsedContent && parsedContent.blocks && Array.isArray(parsedContent.blocks)) {
                        // Convert Editor.js JSON to HTML
                        existingContent = convertEditorJsonToHtml(existingContent);
                    }
                } catch (e) {
                    // Already HTML or plain text
                }
            }
            
            // Sanitize existing content
            existingContent = sanitizeHtml(existingContent);
            
            // Append new content
            const combinedContent = existingContent + (existingContent ? '<br><br>' : '') + sanitizedContent;
            
            // Update document
            await updateDoc(docRef, {
                content: combinedContent,
                updatedAt: new Date()
            });
            
            // Update local state if this is the current document
            if (targetDocId === currentDocumentId) {
                setCurrentDocumentContent(combinedContent);
                
                // Update editor if it exists
                if (editorElementRef.current && editorElementRef.current._richEditor) {
                    editorElementRef.current._richEditor.setHtml(combinedContent);
                }
            }
            
            console.log("✅ Appended content to document:", targetDocId);
            return { 
                success: true, 
                message: `Appended content to document`
            };
        } catch (error) {
            console.error("Error appending content to document:", error);
            return { success: false, error: error.message };
        }
    }, [db, userId, appId, currentDocumentId, sanitizeHtml, convertEditorJsonToHtml]);

    // Phase 2: File Upload and Analysis Functions
    const uploadAndAnalyzeFile = useCallback(async (file, extractContent = true) => {
        if (!db || !userId || !appId) {
            console.error("Cannot upload file: missing db, userId, or appId");
            return { success: false, error: "Database not initialized" };
        }
        
        try {
            // Upload file to Firebase Storage
            const storage = getStorage();
            const fileRef = ref(storage, `artifacts/${appId}/users/${userId}/files/${Date.now()}_${file.name}`);
            
            setIsUploadingFile(true);
            setFileUploadProgress(`Uploading ${file.name}...`);
            
            const uploadTask = uploadBytesResumable(fileRef, file);
            
            return new Promise((resolve) => {
                uploadTask.on('state_changed',
                    (snapshot) => {
                        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                        setFileUploadProgress(`Uploading ${file.name}: ${Math.round(progress)}%`);
                    },
                    (error) => {
                        console.error('Upload error:', error);
                        setIsUploadingFile(false);
                        setFileUploadProgress('');
                        resolve({ success: false, error: error.message });
                    },
                    async () => {
                        try {
                            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                            
                            let extractedContent = '';
                            if (extractContent) {
                                setFileUploadProgress(`Extracting content from ${file.name}...`);
                                extractedContent = await extractFileContent(file, downloadURL);
                            }
                            
                            // Save file metadata to Firestore
                            const fileData = {
                                fileName: file.name,
                                fileSize: file.size,
                                fileType: file.type,
                                downloadURL: downloadURL,
                                extractedContent: extractedContent,
                                uploadedAt: new Date(),
                                contentExtracted: extractContent && extractedContent.length > 0,
                                processingStatus: file.type.includes('pdf') ? 'pending' : 'completed'
                            };
                            
                            const fileDocRef = doc(collection(db, `artifacts/${appId}/users/${userId}/uploaded_files`));
                            await setDoc(fileDocRef, fileData);
                            
                            setIsUploadingFile(false);
                            setFileUploadProgress('');
                            
                            console.log("✅ File uploaded and analyzed:", file.name);
                            resolve({ 
                                success: true, 
                                fileId: fileDocRef.id,
                                fileName: file.name,
                                extractedContent: extractedContent,
                                message: `Uploaded and analyzed: ${file.name}`
                            });
                        } catch (error) {
                            console.error('Error saving file metadata:', error);
                            setIsUploadingFile(false);
                            setFileUploadProgress('');
                            resolve({ success: false, error: error.message });
                        }
                    }
                );
            });
        } catch (error) {
            console.error("Error uploading file:", error);
            setIsUploadingFile(false);
            setFileUploadProgress('');
            return { success: false, error: error.message };
        }
    }, [db, userId, appId]);
    
    const searchFileContent = useCallback(async (searchQuery, fileId = null) => {
        if (!db || !userId || !appId) {
            console.error("Cannot search files: missing db, userId, or appId");
            return { success: false, error: "Database not initialized" };
        }
        
        try {
            // Get uploaded files
            const filesCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/uploaded_files`);
            const filesSnapshot = await getDocs(filesCollectionRef);
            
            let filesToSearch = [];
            if (fileId) {
                // Search specific file
                const fileDoc = filesSnapshot.docs.find(doc => doc.id === fileId);
                if (fileDoc) {
                    filesToSearch = [{ id: fileDoc.id, ...fileDoc.data() }];
                }
            } else {
                // Search all files
                filesToSearch = filesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }
            
            // Filter files that have extracted content
            const searchableFiles = filesToSearch.filter(file => file.extractedContent);
            
            if (searchableFiles.length === 0) {
                return { 
                    success: false, 
                    error: "No files with extracted content found to search" 
                };
            }
            
            // Perform search
            const results = [];
            const queryLower = searchQuery.toLowerCase();
            
            for (const file of searchableFiles) {
                const content = file.extractedContent.toLowerCase();
                if (content.includes(queryLower)) {
                    // Find context around the match
                    const index = content.indexOf(queryLower);
                    const start = Math.max(0, index - 100);
                    const end = Math.min(content.length, index + queryLower.length + 100);
                    const context = file.extractedContent.substring(start, end);
                    
                    results.push({
                        fileId: file.id,
                        fileName: file.fileName,
                        fileType: file.fileType,
                        context: context,
                        matchIndex: index
                    });
                }
            }
            
            return { 
                success: true, 
                results: results,
                message: `Found ${results.length} matches in ${searchableFiles.length} files`
            };
        } catch (error) {
            console.error("Error searching file content:", error);
            return { success: false, error: error.message };
        }
    }, [db, userId, appId]);

    // Phase 2: File Content Extraction
    const extractFileContent = useCallback(async (file, downloadURL) => {
        const fileType = file.type.toLowerCase();
        const fileName = file.name.toLowerCase();
        
        try {
            setFileContentProcessingProgress(`Processing ${file.name}...`);
            
            // Handle text files
            if (fileType.includes('text/plain') || fileName.endsWith('.txt')) {
                const response = await fetch(downloadURL);
                const text = await response.text();
                return text;
            }
            
            // Handle PDF files (server-side extraction via Cloud Function)
            if (fileType.includes('pdf') || fileName.endsWith('.pdf')) {
                setFileContentProcessingProgress(`PDF uploaded. Text extraction will be processed automatically...`);
                // Return empty string - Cloud Function will populate extractedContent
                return '';
            }
            
            // Handle Word documents
            if (fileType.includes('document') || fileType.includes('word') || 
                fileName.endsWith('.doc') || fileName.endsWith('.docx')) {
                setFileContentProcessingProgress(`Extracting text from Word document: ${file.name}...`);
                // For now, return a placeholder - Word extraction requires additional libraries
                return `[WORD DOCUMENT: ${file.name}]\nThis Word document has been uploaded but text extraction is not yet implemented. The file contains ${Math.round(file.size / 1024)}KB of data.`;
            }
            
            // Handle JSON files
            if (fileType.includes('json') || fileName.endsWith('.json')) {
                const response = await fetch(downloadURL);
                const jsonText = await response.text();
                const jsonData = JSON.parse(jsonText);
                return `[JSON FILE: ${file.name}]\n${JSON.stringify(jsonData, null, 2)}`;
            }
            
            // Handle CSV files
            if (fileType.includes('csv') || fileName.endsWith('.csv')) {
                const response = await fetch(downloadURL);
                const csvText = await response.text();
                return `[CSV FILE: ${file.name}]\n${csvText}`;
            }
            
            // Handle markdown files
            if (fileName.endsWith('.md') || fileName.endsWith('.markdown')) {
                const response = await fetch(downloadURL);
                const text = await response.text();
                return `[MARKDOWN FILE: ${file.name}]\n${text}`;
            }
            
            // Handle other text-based files
            if (fileType.includes('text/') || 
                fileName.endsWith('.js') || fileName.endsWith('.ts') || 
                fileName.endsWith('.jsx') || fileName.endsWith('.tsx') ||
                fileName.endsWith('.css') || fileName.endsWith('.html') ||
                fileName.endsWith('.xml') || fileName.endsWith('.yaml') ||
                fileName.endsWith('.yml') || fileName.endsWith('.log')) {
                const response = await fetch(downloadURL);
                const text = await response.text();
                return `[${fileType.toUpperCase()} FILE: ${file.name}]\n${text}`;
            }
            
            // Unsupported file type
            return `[BINARY FILE: ${file.name}]\nThis file type (${fileType}) is not supported for text extraction. File size: ${Math.round(file.size / 1024)}KB.`;
            
        } catch (error) {
            console.error('Error extracting file content:', error);
            return `[ERROR: ${file.name}]\nFailed to extract content from this file. Error: ${error.message}`;
        }
    }, []);

    // Emoji categories and data for icon picker
    const emojiCategories = {
        'Smileys': ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩'],
        'Objects': ['📱', '💻', '⌨️', '🖥️', '🖨️', '📞', '📠', '📺', '📻', '🎵', '🎶', '📢', '📣', '📯', '🔔', '🔕'],
        'Work': ['💼', '📊', '📈', '📉', '📋', '📌', '📍', '📎', '🖇️', '📏', '📐', '✂️', '📝', '✏️', '✒️', '🖊️'],
        'Study': ['📚', '📖', '📓', '📔', '📒', '📕', '📗', '📘', '📙', '📰', '🗞️', '📜', '⭐', '🌟', '💡', '🔍'],
        'Food': ['🍎', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅'],
        'Travel': ['✈️', '🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🏍️'],
        'Activities': ['⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍'],
        'Nature': ['🌱', '🌿', '🍀', '🍃', '🌸', '🌺', '🌻', '🌹', '🌷', '🌼', '🌵', '🌲', '🌳', '🌴', '☘️', '🍄'],
        'Symbols': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖']
    };

    const emojiData = {
        // Smileys
        '😀': ['happy', 'smile', 'joy', 'grin'],
        '😃': ['happy', 'smile', 'joy', 'grin'],
        '😄': ['happy', 'smile', 'joy', 'laugh'],
        '😁': ['happy', 'smile', 'joy', 'grin'],
        '😆': ['happy', 'laugh', 'joy', 'funny'],
        '😅': ['happy', 'laugh', 'sweat', 'relief'],
        '🤣': ['laugh', 'funny', 'hilarious', 'joy'],
        '😂': ['laugh', 'funny', 'cry', 'tears'],
        '🙂': ['smile', 'happy', 'content'],
        '🙃': ['silly', 'playful', 'upside'],
        '😉': ['wink', 'flirt', 'playful'],
        '😊': ['happy', 'smile', 'blush'],
        '😇': ['angel', 'innocent', 'halo'],
        '🥰': ['love', 'happy', 'hearts'],
        '😍': ['love', 'heart', 'eyes'],
        '🤩': ['star', 'excited', 'wow'],
        
        // Objects  
        '📱': ['phone', 'mobile', 'device', 'technology'],
        '💻': ['computer', 'laptop', 'technology', 'work'],
        '⌨️': ['keyboard', 'typing', 'computer'],
        '🖥️': ['computer', 'desktop', 'monitor'],
        '🖨️': ['printer', 'print', 'document'],
        '📞': ['phone', 'call', 'telephone'],
        '📠': ['fax', 'machine', 'document'],
        '📺': ['tv', 'television', 'screen'],
        '📻': ['radio', 'music', 'sound'],
        '🎵': ['music', 'note', 'sound'],
        '🎶': ['music', 'notes', 'sound'],
        '📢': ['megaphone', 'announcement'],
        '📣': ['megaphone', 'cheer', 'loud'],
        '📯': ['horn', 'sound', 'announcement'],
        '🔔': ['bell', 'notification', 'alert'],
        '🔕': ['bell', 'mute', 'silent'],
        
        // Work
        '💼': ['briefcase', 'work', 'business'],
        '📊': ['chart', 'graph', 'data', 'analytics'],
        '📈': ['chart', 'growth', 'increase', 'up'],
        '📉': ['chart', 'decrease', 'down', 'loss'],
        '📋': ['clipboard', 'list', 'checklist'],
        '📌': ['pin', 'important', 'mark'],
        '📍': ['pin', 'location', 'place'],
        '📎': ['paperclip', 'attach', 'clip'],
        '🖇️': ['paperclip', 'attach', 'link'],
        '📏': ['ruler', 'measure', 'length'],
        '📐': ['triangle', 'ruler', 'measure'],
        '✂️': ['scissors', 'cut', 'trim'],
        '📝': ['memo', 'note', 'write', 'document'],
        '✏️': ['pencil', 'write', 'edit'],
        '✒️': ['pen', 'write', 'ink'],
        '🖊️': ['pen', 'write', 'ballpoint'],
        
        // Study
        '📚': ['books', 'study', 'learn', 'education'],
        '📖': ['book', 'read', 'open', 'study'],
        '📓': ['notebook', 'notes', 'study'],
        '📔': ['notebook', 'notes', 'journal'],
        '📒': ['ledger', 'notebook', 'record'],
        '📕': ['book', 'closed', 'red'],
        '📗': ['book', 'closed', 'green'],
        '📘': ['book', 'closed', 'blue'],
        '📙': ['book', 'closed', 'orange'],
        '📰': ['newspaper', 'news', 'read'],
        '🗞️': ['newspaper', 'news', 'rolled'],
        '📜': ['scroll', 'document', 'ancient'],
        '⭐': ['star', 'favorite', 'important'],
        '🌟': ['star', 'sparkle', 'special'],
        '💡': ['idea', 'lightbulb', 'bright', 'innovation'],
        '🔍': ['search', 'magnify', 'find'],
        
        // Food
        '🍎': ['apple', 'fruit', 'red', 'healthy'],
        '🍊': ['orange', 'fruit', 'citrus'],
        '🍋': ['lemon', 'fruit', 'citrus', 'sour'],
        '🍌': ['banana', 'fruit', 'yellow'],
        '🍉': ['watermelon', 'fruit', 'summer'],
        '🍇': ['grapes', 'fruit', 'purple'],
        '🍓': ['strawberry', 'fruit', 'red', 'berry'],
        '🫐': ['blueberry', 'fruit', 'blue', 'berry'],
        '🍈': ['melon', 'fruit', 'green'],
        '🍒': ['cherry', 'fruit', 'red'],
        '🍑': ['peach', 'fruit', 'orange'],
        '🥭': ['mango', 'fruit', 'tropical'],
        '🍍': ['pineapple', 'fruit', 'tropical'],
        '🥥': ['coconut', 'fruit', 'tropical'],
        '🥝': ['kiwi', 'fruit', 'green'],
        '🍅': ['tomato', 'fruit', 'red'],
        
        // Travel
        '✈️': ['airplane', 'travel', 'flight', 'vacation'],
        '🚗': ['car', 'drive', 'vehicle'],
        '🚕': ['taxi', 'car', 'yellow'],
        '🚙': ['suv', 'car', 'vehicle'],
        '🚌': ['bus', 'public', 'transport'],
        '🚎': ['trolley', 'bus', 'electric'],
        '🏎️': ['race', 'car', 'fast', 'speed'],
        '🚓': ['police', 'car', 'law'],
        '🚑': ['ambulance', 'medical', 'emergency'],
        '🚒': ['fire', 'truck', 'emergency'],
        '🚐': ['van', 'vehicle', 'minibus'],
        '🛻': ['truck', 'pickup', 'vehicle'],
        '🚚': ['truck', 'delivery', 'lorry'],
        '🚛': ['truck', 'semi', 'articulated'],
        '🚜': ['tractor', 'farm', 'agriculture'],
        '🏍️': ['motorcycle', 'bike', 'motorbike'],
        
        // Activities
        '⚽': ['soccer', 'football', 'sport', 'ball'],
        '🏀': ['basketball', 'sport', 'ball'],
        '🏈': ['football', 'american', 'sport'],
        '⚾': ['baseball', 'sport', 'ball'],
        '🥎': ['softball', 'sport', 'ball'],
        '🎾': ['tennis', 'sport', 'ball'],
        '🏐': ['volleyball', 'sport', 'ball'],
        '🏉': ['rugby', 'sport', 'ball'],
        '🥏': ['frisbee', 'disc', 'throw'],
        '🎱': ['billiards', 'pool', 'eight'],
        '🪀': ['yoyo', 'toy', 'string'],
        '🏓': ['ping', 'pong', 'table', 'tennis'],
        '🏸': ['badminton', 'sport', 'shuttlecock'],
        '🏒': ['hockey', 'ice', 'stick'],
        '🏑': ['hockey', 'field', 'stick'],
        '🥍': ['lacrosse', 'sport', 'stick'],
        
        // Nature
        '🌱': ['plant', 'growth', 'seedling', 'green'],
        '🌿': ['herb', 'leaf', 'green', 'nature'],
        '🍀': ['clover', 'luck', 'four', 'leaf'],
        '🍃': ['leaves', 'nature', 'wind', 'green'],
        '🌸': ['flower', 'blossom', 'pink', 'spring'],
        '🌺': ['flower', 'hibiscus', 'tropical'],
        '🌻': ['sunflower', 'yellow', 'sun'],
        '🌹': ['rose', 'flower', 'red', 'love'],
        '🌷': ['tulip', 'flower', 'spring'],
        '🌼': ['daisy', 'flower', 'white'],
        '🌵': ['cactus', 'desert', 'plant'],
        '🌲': ['tree', 'evergreen', 'pine'],
        '🌳': ['tree', 'deciduous', 'green'],
        '🌴': ['palm', 'tree', 'tropical'],
        '☘️': ['shamrock', 'luck', 'irish'],
        '🍄': ['mushroom', 'fungi', 'toadstool'],
        
        // Symbols
        '❤️': ['heart', 'love', 'red'],
        '🧡': ['heart', 'orange', 'love'],
        '💛': ['heart', 'yellow', 'love'],
        '💚': ['heart', 'green', 'love'],
        '💙': ['heart', 'blue', 'love'],
        '💜': ['heart', 'purple', 'love'],
        '🖤': ['heart', 'black', 'love'],
        '🤍': ['heart', 'white', 'love'],
        '🤎': ['heart', 'brown', 'love'],
        '💔': ['broken', 'heart', 'sad'],
        '❣️': ['heart', 'exclamation', 'love'],
        '💕': ['hearts', 'love', 'pink'],
        '💞': ['hearts', 'revolving', 'love'],
        '💓': ['beating', 'heart', 'love'],
        '💗': ['growing', 'heart', 'love'],
        '💖': ['sparkling', 'heart', 'love']
    };

    // Ref for the LLM response scroll
    const llmResponseRef = useRef(null);
    const saveTimerRef = useRef(null); // Ref to hold the autosave timer
    const templateMenuRef = useRef(null); // Ref for template menu for click outside detection
    const resizeRef = useRef(null); // Ref for resize functionality

    // Refs for Editor.js
    const editorRef = useRef(null); // Reference to the Editor.js instance
    const editorElementRef = useRef(null); // Reference to the div element where Editor.js will be mounted
    
    // File Management Refs
    const fileInputRef = useRef(null); // Reference to the hidden file input

    // Simple, reliable editor state
    const [editorReady, setEditorReady] = useState(false);

    // Initialize simple rich text editor immediately
    useEffect(() => {
        if (!isAuthReady || !editorElementRef.current || editorReady) return;

        try {
            console.log("🚀 Initializing reliable rich text editor...");
            
            // Clear any existing content
            editorElementRef.current.innerHTML = '';
            
            // Convert Editor.js JSON to HTML for rich text editor and sanitize
            const htmlContent = sanitizeHtml(convertEditorJsonToHtml(currentDocumentContent));
            console.log("📝 Converted and sanitized content for rich text editor:", htmlContent.substring(0, 100) + '...');
            
            // Initialize the simple rich text editor with converted content
            window.setCurrentDocumentContent = setCurrentDocumentContent;
            createSimpleRichEditor(editorElementRef.current, htmlContent, setCurrentDocumentContent);
            
            setEditorReady(true);
            console.log("✅ Rich text editor ready!");
            
        } catch (error) {
            console.error("❌ Editor initialization failed:", error);
        }
    }, [isAuthReady, convertEditorJsonToHtml]);

    // Update editor content when document changes
    useEffect(() => {
        if (!editorReady || !editorElementRef.current?._richEditor) return;

        const richEditor = editorElementRef.current._richEditor;
        if (richEditor && richEditor.updateContent) {
            const currentEditorContent = richEditor.editor?.innerHTML || '';
            const htmlContent = convertEditorJsonToHtml(currentDocumentContent);
            
            if (currentEditorContent !== htmlContent) {
                richEditor.updateContent(htmlContent);
                console.log("📝 Editor content updated with converted HTML");
            }
        }
    }, [currentDocumentId, currentDocumentContent, editorReady, convertEditorJsonToHtml]);

    // Load Editor.js dynamically
    useEffect(() => {
        // Load Editor.js CSS with fallback
        if (!document.querySelector('link[href*="editorjs"]')) {
            const editorCSS = document.createElement('link');
            editorCSS.rel = 'stylesheet';
            editorCSS.href = 'https://cdn.jsdelivr.net/npm/@editorjs/editorjs@2.28.2/dist/editor.css';
            editorCSS.onerror = () => {
                console.log("CSS fallback to unpkg");
                const fallbackCSS = document.createElement('link');
                fallbackCSS.rel = 'stylesheet';
                fallbackCSS.href = 'https://unpkg.com/@editorjs/editorjs@2.28.2/dist/editor.css';
                document.head.appendChild(fallbackCSS);
            };
            document.head.appendChild(editorCSS);
        }

        // Load DOMPurify for HTML sanitization
        if (!window.DOMPurify) {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/dompurify@2.4.0/dist/purify.min.js';
            script.onload = () => console.log("✅ DOMPurify loaded for HTML sanitization");
            script.onerror = () => console.error("❌ Failed to load DOMPurify");
            document.head.appendChild(script);
        }
        
        // Load Turndown for HTML to Markdown conversion
        if (!window.TurndownService) {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/turndown/dist/turndown.js';
            script.onload = () => console.log("✅ Turndown loaded for HTML to Markdown conversion");
            script.onerror = () => console.error("❌ Failed to load Turndown");
            document.head.appendChild(script);
        }
        
        console.log("📝 Using reliable rich text editor (no CDN dependencies)");
    }, []);

    // Firebase Initialization and Authentication
    useEffect(() => {
        try {
            const firebaseConfig = {
                apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
                authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
                projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
                storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
                messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
                appId: process.env.REACT_APP_FIREBASE_APP_ID,
            };

            // Validate that all required environment variables are present
            const requiredEnvVars = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
            const missingVars = requiredEnvVars.filter(key => !firebaseConfig[key]);
            
            if (missingVars.length > 0) {
                console.error('Missing required Firebase environment variables:', missingVars);
                console.error('Please check your .env file contains all required REACT_APP_FIREBASE_* variables');
                return;
            }
            
            setAppId(firebaseConfig.appId);
            const app = initializeApp(firebaseConfig);
            const firestore = getFirestore(app);
            const firebaseAuth = getAuth(app);

            setDb(firestore);
            console.log('Firebase initialized successfully');

            const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
                if (user) {
                    setUserId(user.uid);
                    setIsAuthReady(true);
                    console.log("Firebase: User authenticated with ID:", user.uid);
                } else {
                    try {
                        console.log("Firebase: No user found, signing in anonymously...");
                        await signInAnonymously(firebaseAuth);
                    } catch (error) {
                        console.error("Firebase: Anonymous sign-in failed:", error);
                        console.log("Firebase: Using fallback local user ID for development");
                        
                        // Fallback: create a persistent local user ID for development
                        let localUserId = localStorage.getItem('local-user-id');
                        if (!localUserId) {
                            localUserId = 'local-user-' + Math.random().toString(36).substr(2, 9);
                            localStorage.setItem('local-user-id', localUserId);
                            console.log("Firebase: Created new persistent local user ID:", localUserId);
                        } else {
                            console.log("Firebase: Retrieved existing local user ID:", localUserId);
                        }
                        setUserId(localUserId);
                        setIsAuthReady(true);
                    }
                }
            });

            return () => unsubscribe();
        } catch (error) {
            console.error("Firebase Initialization Failed:", error);
        }
    }, []);

    // Fetch documents and listen for real-time updates
    useEffect(() => {
        if (!isAuthReady || !db || !userId || !appId) {
            console.log("Firestore: Not ready to fetch documents. isAuthReady:", isAuthReady, "db:", !!db, "userId:", !!userId, "appId:", !!appId);
            return;
        }

        const documentsCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/notes`);
        console.log("Firestore: Attempting to subscribe to documents at path:", `artifacts/${appId}/users/${userId}/notes`);

        const unsubscribe = onSnapshot(documentsCollectionRef, async (snapshot) => {
            const fetchedDocuments = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                tags: doc.data().tags || []
            }));
            fetchedDocuments.sort((a, b) => (a.title || 'Untitled').localeCompare(b.title || 'Untitled'));
            setDocuments(fetchedDocuments);

            // Auto-create first document if none exist
            if (fetchedDocuments.length === 0) {
                console.log("No documents found, creating first document automatically...");
                try {
                    const newDocId = crypto.randomUUID();
                    const newDocData = {
                        id: newDocId,
                        title: '',
                        content: '',
                        tags: [],
                        parentId: null,
                        order: Date.now(),
                        icon: '',
                        coverImage: '',
                        createdAt: new Date(),
                        updatedAt: new Date()
                    };
                    
                    const newDocRef = doc(collection(db, `artifacts/${appId}/users/${userId}/notes`), newDocId);
                    await setDoc(newDocRef, newDocData);
                    
                    setCurrentDocumentId(newDocId);
                    console.log("First document created successfully with ID:", newDocId);
                } catch (error) {
                    console.error("Error creating first document:", error);
                }
                return;
            }

            if (!currentDocumentId && fetchedDocuments.length > 0) {
                setCurrentDocumentId(fetchedDocuments[0].id);
            } else if (currentDocumentId && !fetchedDocuments.find(doc => doc.id === currentDocumentId)) {
                setCurrentDocumentId(fetchedDocuments.length > 0 ? fetchedDocuments[0].id : null);
                setCurrentDocumentContent('');
                setCurrentDocumentTitle('');
                setCurrentDocumentTags([]);
                setLlmResponse('');
            }
        }, (error) => {
            console.error("Error fetching documents:", error);
        });

        return () => unsubscribe();
    }, [isAuthReady, db, userId, appId, currentDocumentId]);

    // Listen for uploaded files
    useEffect(() => {
        if (!isAuthReady || !db || !appId) {
            return;
        }

        const activeUserId = userId || 'anonymous-user';
        const uploadedFilesCollectionRef = collection(db, `artifacts/${appId}/users/${activeUserId}/uploaded_files`);
        console.log("Firestore: Subscribing to uploaded files at path:", `artifacts/${appId}/users/${activeUserId}/uploaded_files`);

        const unsubscribe = onSnapshot(uploadedFilesCollectionRef, (snapshot) => {
            const fetchedFiles = snapshot.docs.map(doc => {
                const data = doc.data();
                const fileData = {
                    id: doc.id, // Firestore document ID
                    ...data
                };
                
                // Debug: Check if there's a custom id field that conflicts
                if (data.id && data.id !== doc.id) {
                    console.warn('File has conflicting ID fields:', {
                        firestoreId: doc.id,
                        customId: data.id,
                        fileName: data.fileName
                    });
                }
                
                return fileData;
            });
            fetchedFiles.sort((a, b) => (b.uploadDate?.toDate() || new Date()) - (a.uploadDate?.toDate() || new Date()));
            setUploadedFiles(fetchedFiles);
            console.log("Uploaded files updated:", fetchedFiles.length, "files:", fetchedFiles.map(f => ({ id: f.id, fileName: f.fileName })));
        }, (error) => {
            console.error("Error listening to uploaded files:", error);
        });

        return unsubscribe;
    }, [isAuthReady, db, userId, appId]);

    // Listen for Google links
    useEffect(() => {
        if (!isAuthReady || !db || !appId) {
            return;
        }

        const activeUserId = userId || 'anonymous-user';
        const googleLinksCollectionRef = collection(db, `artifacts/${appId}/users/${activeUserId}/google_links`);
        console.log("Firestore: Subscribing to Google links at path:", `artifacts/${appId}/users/${activeUserId}/google_links`);

        const unsubscribe = onSnapshot(googleLinksCollectionRef, (snapshot) => {
            const fetchedLinks = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            fetchedLinks.sort((a, b) => (b.addDate?.toDate() || new Date()) - (a.addDate?.toDate() || new Date()));
            setGoogleLinks(fetchedLinks);
            console.log("Google links updated:", fetchedLinks.length);
            console.log("Google links IDs:", fetchedLinks.map(link => ({ id: link.id, title: link.title })));
        }, (error) => {
            console.error("Error listening to Google links:", error);
        });

        return unsubscribe;
    }, [isAuthReady, db, userId, appId]);

    // Fetch content of the current document and initialize Quill
    useEffect(() => {
        const fetchDocumentContent = async () => {
            if (!db || !userId || !currentDocumentId || !appId) {
                console.log("Firestore: Cannot fetch current document content. Missing db, userId, currentDocumentId, or appId.");
                setCurrentDocumentContent('');
                setCurrentDocumentTitle('');
                setCurrentDocumentTags([]);
                setLlmResponse('');
                if (editorRef.current) {
                    // Clear Editor.js content
                    editorRef.current.render({ blocks: [] });
                }
                return;
            }

            const docRef = doc(db, `artifacts/${appId}/users/${userId}/notes`, currentDocumentId);
            console.log("Firestore: Attempting to fetch content for doc ID:", currentDocumentId, "at path:", `artifacts/${appId}/users/${userId}/notes/${currentDocumentId}`);

            try {
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    let content = data.content || '';
                    
                    // Detect content format and handle accordingly
                    if (content && typeof content === 'string') {
                        try {
                            // Try to parse as JSON to check if it's Editor.js format
                            const parsedContent = JSON.parse(content);
                            if (parsedContent && parsedContent.blocks && Array.isArray(parsedContent.blocks)) {
                                // It's Editor.js JSON format - convert to HTML
                                console.log("📄 Detected Editor.js JSON format, converting to HTML");
                                content = convertEditorJsonToHtml(content);
                            } else {
                                // It's a JSON string but not Editor.js format - treat as HTML
                                console.log("📄 Detected JSON string (non-Editor.js), treating as HTML");
                            }
                        } catch (e) {
                            // Not valid JSON - assume it's HTML
                            console.log("📄 Detected HTML format");
                        }
                    }
                    
                    // Sanitize the content regardless of format
                    content = sanitizeHtml(content);
                    
                    setCurrentDocumentContent(content);
                    setCurrentDocumentTitle(data.title || 'Untitled');
                    setCurrentDocumentTags(data.tags || []);
                    setCurrentDocumentIcon(data.icon || '');
                    setCurrentDocumentCoverImage(data.coverImage || '');
                } else {
                    setCurrentDocumentContent('');
                    setCurrentDocumentTitle('Untitled');
                    setCurrentDocumentTags([]);
                    setCurrentDocumentIcon('');
                    setCurrentDocumentCoverImage('');
                }
            } catch (error) {
                console.error("Error fetching document content:", error);
            }
        };

        if (isAuthReady) {
            fetchDocumentContent();
        }
    }, [db, userId, currentDocumentId, isAuthReady, appId]);

    // Editor initialization removed - handled by simple useEffect above

    // Feature 2: Internal Linking & Backlinks Handlers
    const detectInternalLinkTrigger = useCallback(() => {
        try {
            const selection = window.getSelection();
            if (!selection.rangeCount) return;

            const range = selection.getRangeAt(0);
            const editorElement = editorElementRef.current;
            
            if (!editorElement || !editorElement.contains(range.commonAncestorContainer)) return;

            // Get text content around cursor
            const textNode = range.startContainer;
            if (textNode.nodeType !== Node.TEXT_NODE) return;

            const textContent = textNode.textContent;
            const cursorPosition = range.startOffset;
            
            // Look for [[ pattern before cursor
            const beforeCursor = textContent.substring(0, cursorPosition);
            const linkMatch = beforeCursor.match(/\[\[([^\]]*?)$/);
            
            if (linkMatch && allDocumentTitles.length > 0) {
                const searchTerm = linkMatch[1];
                const linkStartPos = cursorPosition - linkMatch[0].length;
                
                // Create range for the [[ trigger
                const linkRange = document.createRange();
                linkRange.setStart(textNode, linkStartPos);
                linkRange.setEnd(textNode, cursorPosition);
                
                // Get position for autocomplete
                const rect = linkRange.getBoundingClientRect();
                
                // Filter document suggestions
                const suggestions = allDocumentTitles.filter(doc => 
                    doc.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
                    doc.id !== currentDocumentId
                ).slice(0, 5);
                
                setLinkAutocomplete({
                    visible: suggestions.length > 0,
                    x: rect.left,
                    y: rect.bottom + 5,
                    searchTerm,
                    suggestions,
                    selectedIndex: 0,
                    range: linkRange.cloneRange()
                });
            } else {
                setLinkAutocomplete(prev => ({ ...prev, visible: false }));
            }
        } catch (error) {
            console.error('Error detecting internal link trigger:', error);
            setLinkAutocomplete(prev => ({ ...prev, visible: false }));
        }
    }, [allDocumentTitles, currentDocumentId]);

    const updateDocumentLinks = useCallback(async (fromDocId, toDocId) => {
        if (!db || !userId || !appId) return;

        try {
            const docRef = doc(db, `artifacts/${appId}/users/${userId}/notes/${fromDocId}`);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                const docData = docSnap.data();
                const currentLinks = docData.linkedPages || [];
                
                if (!currentLinks.includes(toDocId)) {
                    await updateDoc(docRef, {
                        linkedPages: [...currentLinks, toDocId],
                        updatedAt: new Date()
                    });
                }
            }
        } catch (error) {
            console.error('Error updating document links:', error);
        }
    }, [db, userId, appId]);

    const insertInternalLink = useCallback((targetDoc) => {
        try {
            if (!linkAutocomplete.range || !targetDoc) return;

            const selection = window.getSelection();
            selection.removeAllRanges();
            
            // Extend range to include the full [[ pattern
            const textNode = linkAutocomplete.range.startContainer;
            const fullRange = document.createRange();
            fullRange.setStart(textNode, linkAutocomplete.range.startOffset);
            fullRange.setEnd(textNode, linkAutocomplete.range.endOffset + linkAutocomplete.searchTerm.length);
            
            selection.addRange(fullRange);
            
            // Create internal link HTML with proper styling
            const linkHtml = `<a href="#" data-internal-link-id="${targetDoc.id}" class="internal-link">${targetDoc.title}</a>`;
            
            // Replace the [[ pattern with the link
            document.execCommand('insertHTML', false, linkHtml);
            
            // Update document's linked pages
            updateDocumentLinks(currentDocumentId, targetDoc.id);
            
            // Hide autocomplete
            setLinkAutocomplete(prev => ({ ...prev, visible: false }));
            
            // Trigger content save
            if (editorElementRef.current?._richEditor?.handleChange) {
                editorElementRef.current._richEditor.handleChange();
            }
        } catch (error) {
            console.error('Error inserting internal link:', error);
            setLinkAutocomplete(prev => ({ ...prev, visible: false }));
        }
    }, [linkAutocomplete.range, linkAutocomplete.searchTerm, currentDocumentId, updateDocumentLinks]);

    const fetchDocumentBacklinks = useCallback(async (docId) => {
        if (!db || !userId || !appId || !docId) return;

        try {
            const notesRef = collection(db, `artifacts/${appId}/users/${userId}/notes`);
            const snapshot = await getDocs(notesRef);
            
            const backlinks = [];
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                if (data.linkedPages && data.linkedPages.includes(docId)) {
                    backlinks.push({
                        id: doc.id,
                        title: data.title || 'Untitled',
                        updatedAt: data.updatedAt
                    });
                }
            });
            
            setDocumentBacklinks(backlinks);
        } catch (error) {
            console.error('Error fetching backlinks:', error);
        }
    }, [db, userId, appId]);

    // Handle internal link clicks
    const handleInternalLinkClick = useCallback((e) => {
        if (e.target.matches('a[data-internal-link-id]')) {
            e.preventDefault();
            const targetDocId = e.target.getAttribute('data-internal-link-id');
            if (targetDocId && targetDocId !== currentDocumentId) {
                // Set the current document to the target document
                setCurrentDocumentId(targetDocId);
            }
        }
    }, [currentDocumentId]);

    // Separate useEffect for text selection listeners and internal linking
    useEffect(() => {
        console.log("Setting up text selection and internal linking listeners");
        
        // Add text selection listeners for contextual Q&A
        document.addEventListener('mouseup', handleTextSelection);
        document.addEventListener('keyup', handleTextSelection);
        
        // Also add selectionchange for better detection
        document.addEventListener('selectionchange', handleTextSelection);
        
        // Add input listener for internal linking detection
        const handleInput = (e) => {
            // Debounce the link detection
            setTimeout(() => {
                detectInternalLinkTrigger();
            }, 100);
        };
        
        // Add keyboard navigation for autocomplete
        const handleKeyDown = (e) => {
            if (!linkAutocomplete.visible) return;
            
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    setLinkAutocomplete(prev => ({
                        ...prev,
                        selectedIndex: Math.min(prev.selectedIndex + 1, prev.suggestions.length - 1)
                    }));
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    setLinkAutocomplete(prev => ({
                        ...prev,
                        selectedIndex: Math.max(prev.selectedIndex - 1, 0)
                    }));
                    break;
                case 'Enter':
                    e.preventDefault();
                    if (linkAutocomplete.suggestions[linkAutocomplete.selectedIndex]) {
                        insertInternalLink(linkAutocomplete.suggestions[linkAutocomplete.selectedIndex]);
                    }
                    break;
                case 'Escape':
                    e.preventDefault();
                    setLinkAutocomplete(prev => ({ ...prev, visible: false }));
                    break;
                default:
                    // No action needed for other keys
                    break;
            }
        };
        
        document.addEventListener('input', handleInput);
        document.addEventListener('keydown', handleKeyDown);
        
        console.log("Text selection and internal linking listeners attached to document");
        
        // Cleanup
        return () => {
            document.removeEventListener('mouseup', handleTextSelection);
            document.removeEventListener('keyup', handleTextSelection);
            document.removeEventListener('selectionchange', handleTextSelection);
            document.removeEventListener('input', handleInput);
            document.removeEventListener('keydown', handleKeyDown);
            console.log("Text selection and internal linking listeners removed");
        };
    }, [handleTextSelection, detectInternalLinkTrigger, linkAutocomplete.visible, linkAutocomplete.selectedIndex, linkAutocomplete.suggestions, insertInternalLink]);

    // Update all document titles for autocomplete
    useEffect(() => {
        if (documents.length > 0) {
            const titles = documents.map(doc => ({
                id: doc.id,
                title: doc.title || 'Untitled'
            }));
            setAllDocumentTitles(titles);
        }
    }, [documents]);

    // Fetch backlinks when document changes
    useEffect(() => {
        if (currentDocumentId) {
            fetchDocumentBacklinks(currentDocumentId);
        }
    }, [currentDocumentId, fetchDocumentBacklinks]);

    // Add click listener for internal links
    useEffect(() => {
        const editorElement = editorElementRef.current;
        if (editorElement) {
            editorElement.addEventListener('click', handleInternalLinkClick);
            return () => {
                editorElement.removeEventListener('click', handleInternalLinkClick);
            };
        }
    }, [handleInternalLinkClick]);

    // Content update logic removed - handled by simple useEffect above

    // Auto-scroll LLM response to bottom
    useEffect(() => {
        if (llmResponseRef.current) {
            llmResponseRef.current.scrollTop = llmResponseRef.current.scrollHeight;
        }
    }, [llmResponse]);

    // Autosave mechanism
    useEffect(() => {
        if (!isAuthReady || !db || !userId || !currentDocumentId || !appId) {
            return;
        }

        // Don't trigger save if content is empty on initial load
        if (!currentDocumentContent && !currentDocumentTitle && currentDocumentTags.length === 0) {
            return;
        }

        setSaveStatus('Saving...');

        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
        }

        saveTimerRef.current = setTimeout(async () => {
            const docRef = doc(db, `artifacts/${appId}/users/${userId}/notes`, currentDocumentId);
            try {
                await updateDoc(docRef, {
                    content: currentDocumentContent,
                    title: currentDocumentTitle || 'Untitled',
                    tags: currentDocumentTags,
                    updatedAt: new Date()
                });
                setSaveStatus('All changes saved');
                
                // Don't reload the content after save to prevent cursor jumping
                console.log("Document saved without triggering content reload");
            } catch (e) {
                setSaveStatus('Save error!');
                console.error("Error autosaving document: ", e);
            }
        }, 1000);

        return () => {
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
            }
        };
    }, [currentDocumentContent, currentDocumentTitle, currentDocumentTags, currentDocumentId, db, userId, isAuthReady, appId]);

    const handleAddTag = (tag) => {
        const newTag = tag.trim().toLowerCase();
        if (newTag && !currentDocumentTags.includes(newTag)) {
            setCurrentDocumentTags([...currentDocumentTags, newTag]);
        }
    };

    const handleRemoveTag = (tagToRemove) => {
        setCurrentDocumentTags(currentDocumentTags.filter(tag => tag !== tagToRemove));
    };

    const getSuggestedTags = async () => {
        if (!currentDocumentContent || !currentDocumentContent.trim()) {
            setSuggestedTags([]);
            return;
        }

        const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
        if (!apiKey) {
            console.error("API key not found for tag suggestions");
            return;
        }

        setIsLoadingSuggestions(true);
        setSuggestedTags([]);

        try {
            // Convert content to plain text for analysis
            let plainTextContent = '';
            if (currentDocumentContent) {
                try {
                    // Try to parse as Editor.js format first
                    const parsed = JSON.parse(currentDocumentContent);
                    if (parsed.blocks) {
                        plainTextContent = convertEditorToPlainText(parsed);
                    } else {
                        // Fallback to HTML conversion
                        plainTextContent = convertHtmlToPlainText(currentDocumentContent);
                    }
                } catch (e) {
                    // Not JSON, treat as HTML/plain text
                    plainTextContent = convertHtmlToPlainText(currentDocumentContent);
                }
            }

            const prompt = `Analyze the following document content and suggest 3-5 relevant tags. The tags should be:
- Single words or short phrases (1-2 words max)
- Relevant to the main topics, themes, or categories
- Useful for organizing and finding this document later
- In lowercase
- Separated by commas

Document title: ${currentDocumentTitle || 'Untitled'}
Document content:
${plainTextContent}

Respond with only the suggested tags, separated by commas, nothing else.`;

            const payload = {
                contents: [{ role: "user", parts: [{ text: prompt }] }]
            };

            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (result.candidates && result.candidates.length > 0 &&
                result.candidates[0].content && result.candidates[0].content.parts &&
                result.candidates[0].content.parts.length > 0) {
                
                const tagsText = result.candidates[0].content.parts[0].text.trim();
                const tags = tagsText.split(',').map(tag => tag.trim().toLowerCase()).filter(tag => tag);
                
                // Filter out tags that are already added
                const newTags = tags.filter(tag => !currentDocumentTags.includes(tag));
                setSuggestedTags(newTags.slice(0, 5)); // Limit to 5 suggestions
            }
        } catch (error) {
            console.error("Error getting tag suggestions:", error);
        } finally {
            setIsLoadingSuggestions(false);
        }
    };

    const addSuggestedTag = (tag) => {
        if (!currentDocumentTags.includes(tag)) {
            setCurrentDocumentTags([...currentDocumentTags, tag]);
            setSuggestedTags(suggestedTags.filter(t => t !== tag));
        }
    };

    const getSuggestedTitles = async () => {
        if (!currentDocumentContent?.trim()) {
            return;
        }

        setIsLoadingTitleSuggestions(true);
        const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
        
        if (!apiKey) {
            setIsLoadingTitleSuggestions(false);
            return;
        }

        try {
            // Convert editor content to plain text for analysis
            let contentText = '';
            try {
                const parsed = JSON.parse(currentDocumentContent);
                if (parsed.blocks) {
                    contentText = convertEditorToPlainText(parsed);
                } else {
                    contentText = convertHtmlToPlainText(currentDocumentContent);
                }
            } catch (e) {
                contentText = convertHtmlToPlainText(currentDocumentContent);
            }

            // Get available emojis for context
            const availableEmojis = Object.values(emojiCategories).flat().slice(0, 100).join(' ');

            const prompt = `You are a helpful AI assistant that suggests document titles and matching icons. Based on the content below, suggest 4 concise, descriptive titles with matching emojis.

DOCUMENT CONTENT:
${contentText.slice(0, 2000)} ${contentText.length > 2000 ? '...' : ''}

AVAILABLE EMOJIS (choose from these):
${availableEmojis}

Requirements:
- Each title should be 2-8 words long
- Titles should be descriptive and professional
- Choose emojis that match the content theme (work, ideas, notes, projects, etc.)
- Format: "EMOJI|Title Text" (example: "📝|Meeting Notes")
- Return only 4 suggestions, one per line

Suggested title and icon pairs:`;

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: "user", parts: [{ text: prompt }] }]
                })
            });

            const result = await response.json();
            
            if (result.candidates && result.candidates[0] && result.candidates[0].content && result.candidates[0].content.parts[0]) {
                const suggestionsText = result.candidates[0].content.parts[0].text;
                const suggestions = suggestionsText
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line && line.includes('|'))
                    .map(line => {
                        const [emoji, title] = line.split('|').map(part => part.trim());
                        return { emoji, title };
                    })
                    .filter(suggestion => suggestion.emoji && suggestion.title)
                    .slice(0, 4); // Limit to 4 suggestions
                
                setSuggestedTitles(suggestions);
            }
        } catch (error) {
            console.error('Error getting title suggestions:', error);
        } finally {
            setIsLoadingTitleSuggestions(false);
        }
    };

    const applySuggestedTitle = (suggestion) => {
        setCurrentDocumentTitle(suggestion.title);
        if (suggestion.emoji) {
            updateDocumentIcon(suggestion.emoji);
        }
        setSuggestedTitles([]);
    };

    // Phase 5: New AI Title & Icon Suggestions Handler
    const handleApplyAiTitleIcon = async (suggestedTitle, suggestedIcon) => {
        if (!db || !userId || !currentDocumentId || !appId) return;
        const docRef = doc(db, `artifacts/${appId}/users/${userId}/notes`, currentDocumentId);
        try {
            await updateDoc(docRef, {
                title: suggestedTitle,
                icon: suggestedIcon // Update icon field too
            });
            setCurrentDocumentTitle(suggestedTitle);
            setCurrentDocumentIcon(suggestedIcon);
            setSaveStatus('Title & icon updated!');
            setAiTitleIconSuggestions([]); // Clear suggestions after applying
            setShowAiTitleSuggestions(false); // Hide the suggestion UI
        } catch (e) {
            console.error("Error applying AI title/icon:", e);
            setSaveStatus('Failed to update title/icon!');
        }
    };

    // Phase 5: AI Title & Icon Suggestions Handler - Silent background processing
    const handleTriggerAiTitleIconSuggestions = async () => {
        if (!currentDocumentId || !currentDocumentContent) return;
        
        const plainTextContent = convertHtmlToPlainText(currentDocumentContent);
        const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
        
        if (!apiKey) {
            console.error('API key not found for AI suggestions');
            return;
        }

        try {
            const prompt = `Based on the following document content, suggest a good title and relevant icon:

DOCUMENT TITLE: ${currentDocumentTitle || 'Untitled'}
DOCUMENT CONTENT:
${plainTextContent}

Please analyze the content and suggest an appropriate title and icon. Respond with a JSON object containing "title" and "icon" fields.`;

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: "user", parts: [{ text: prompt }] }],
                    generationConfig: {
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: "OBJECT",
                            properties: {
                                title: { type: "STRING" },
                                icon: { type: "STRING" }
                            },
                            required: ["title", "icon"]
                        }
                    }
                })
            });

            if (response.ok) {
                const data = await response.json();
                const suggestion = JSON.parse(data.candidates[0].content.parts[0].text);
                setAiTitleIconSuggestions([suggestion]);
            }
        } catch (error) {
            console.error('Error getting AI title/icon suggestions:', error);
        }
    };

    // Phase 5: AI Tag Suggestions Handler - Silent background processing
    const handleTriggerAiTagSuggestions = async () => {
        if (!currentDocumentId || !currentDocumentContent) return;
        
        const plainTextContent = convertHtmlToPlainText(currentDocumentContent);
        const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
        
        if (!apiKey) {
            console.error('API key not found for AI suggestions');
            return;
        }

        try {
            const prompt = `Based on the following document content, suggest relevant tags:

DOCUMENT TITLE: ${currentDocumentTitle || 'Untitled'}
DOCUMENT CONTENT:
${plainTextContent}

Please analyze the content and suggest 3-5 relevant tags. Respond with a JSON array of strings.`;

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: "user", parts: [{ text: prompt }] }],
                    generationConfig: {
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: "ARRAY",
                            items: { type: "STRING" }
                        }
                    }
                })
            });

            if (response.ok) {
                const data = await response.json();
                const tags = JSON.parse(data.candidates[0].content.parts[0].text);
                setAiTagSuggestions(tags);
                
                // Auto-dismiss after 10 seconds
                setTimeout(() => {
                    setAiTagSuggestions([]);
                }, 10000);
            }
        } catch (error) {
            console.error('Error getting AI tag suggestions:', error);
        }
    };

    // Feature 1: AI Content Transformation Handlers
    const handleAiTransform = async (transformType) => {
        if (!aiTransformToolbar.selectedText || !aiTransformToolbar.selectedRange) {
            console.error('No text selected for transformation');
            return;
        }

        setAiTransformLoading(true);
        setAiTransformLoadingMessage(`${transformType.charAt(0).toUpperCase() + transformType.slice(1)}ing text...`);
        
        // Hide the toolbar during processing
        setAiTransformToolbar(prev => ({ ...prev, visible: false }));

        try {
            const selectedText = aiTransformToolbar.selectedText;
            let prompt = '';
            
            switch (transformType) {
                case 'summarize':
                    prompt = `Please summarize the following text concisely while preserving the key information:

"${selectedText}"

Return only the summarized text without any additional commentary.`;
                    break;
                case 'rewrite':
                    prompt = `Please rewrite the following text to improve clarity, flow, and readability while maintaining the same meaning:

"${selectedText}"

Return only the rewritten text without any additional commentary.`;
                    break;
                case 'expand':
                    prompt = `Please expand on the following text by adding relevant details, examples, or explanations while maintaining the original tone and style:

"${selectedText}"

Return only the expanded text without any additional commentary.`;
                    break;
                default:
                    throw new Error(`Unknown transformation type: ${transformType}`);
            }

            const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=' + process.env.REACT_APP_GEMINI_API_KEY, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }],
                    generationConfig: {
                        temperature: 0.7,
                        topK: 40,
                        topP: 0.95,
                        maxOutputTokens: 2048,
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const transformedText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            
            if (transformedText.trim()) {
                // Sanitize the transformed text
                const sanitizedText = sanitizeHtml(transformedText.trim());
                
                // Create action object for the confirmation system
                const action = {
                    execute: async (finalContent) => {
                        return replaceSelectionWithHtml(finalContent);
                    }
                };
                
                // Show confirmation modal for the transformation
                showConfirmation(
                    action,
                    `${transformType.charAt(0).toUpperCase() + transformType.slice(1)} Text`,
                    `Replace the selected text with the ${transformType}d version?`,
                    sanitizedText
                );
            } else {
                throw new Error('No transformed text received from AI');
            }
        } catch (error) {
            console.error(`Error during ${transformType} transformation:`, error);
            // Show error in chat
            setChatHistory(prev => [...prev, {
                role: 'assistant',
                parts: [{ text: `Sorry, I encountered an error while trying to ${transformType} the selected text: ${error.message}` }]
            }]);
        } finally {
            setAiTransformLoading(false);
            setAiTransformLoadingMessage('');
        }
    };

    // Helper function to replace selected text with transformed content
    const replaceSelectionWithHtml = (htmlContent) => {
        if (!aiTransformToolbar.selectedRange) {
            console.error('No selection range available for replacement');
            return false;
        }

        try {
            // Restore the selection
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(aiTransformToolbar.selectedRange);
            
            // Use document.execCommand for better undo/redo compatibility
            const success = document.execCommand('insertHTML', false, htmlContent);
            
            if (success) {
                // Clear the stored range since it's no longer valid
                setAiTransformToolbar(prev => ({ ...prev, selectedRange: null, selectedText: '' }));
                
                // Trigger content change to save the document
                if (editorElementRef.current?._richEditor?.handleChange) {
                    editorElementRef.current._richEditor.handleChange();
                }
                
                return true;
            } else {
                throw new Error('document.execCommand failed');
            }
        } catch (error) {
            console.error('Error replacing selection:', error);
            return false;
        }
    };

    // Icon picker functionality
    const getFilteredEmojis = () => {
        let emojis = activeIconCategory === 'All' 
            ? Object.values(emojiCategories).flat()
            : emojiCategories[activeIconCategory] || [];
        
        if (iconSearchTerm && iconSearchTerm.trim()) {
            const searchLower = iconSearchTerm.toLowerCase().trim();
            
            emojis = emojis.filter(emoji => {
                const keywords = emojiData[emoji] || [];
                
                // Check if any keyword contains the search term
                const hasKeywordMatch = keywords.some(keyword => 
                    keyword.toLowerCase().includes(searchLower)
                );
                
                // Also check if the emoji itself matches (for direct emoji searches)
                const hasEmojiMatch = emoji.includes(searchLower);
                
                return hasKeywordMatch || hasEmojiMatch;
            });
        }
        
        return emojis;
    };

    const updateDocumentIcon = async (newIcon) => {
        if (!currentDocumentId || !db || !userId || !appId) return;
        
        try {
            const docRef = doc(db, `artifacts/${appId}/users/${userId}/notes/${currentDocumentId}`);
            await updateDoc(docRef, { icon: newIcon });
            setCurrentDocumentIcon(newIcon);
            setShowIconPicker(false);
        } catch (error) {
            console.error('Error updating document icon:', error);
        }
    };

    const compressImage = (file, maxWidth = 1200, quality = 0.8) => {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            
            img.onload = () => {
                // Calculate new dimensions
                let { width, height } = img;
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }
                
                canvas.width = width;
                canvas.height = height;
                
                // Draw and compress
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob(resolve, 'image/jpeg', quality);
            };
            
            img.src = URL.createObjectURL(file);
        });
    };

    const uploadCoverImage = async (file) => {
        console.log('Starting upload process...');
        console.log('Current state:', { currentDocumentId, userId, appId, hasStorage: !!window.firebaseStorage });
        
        if (!currentDocumentId || !userId || !appId) {
            alert('Unable to upload: missing document or user information.');
            return;
        }
        
        // Validate file size (max 5MB for better performance)
        if (file.size > 5 * 1024 * 1024) {
            alert('Image file is too large. Please choose a file smaller than 5MB.');
            return;
        }
        
        setIsUploadingCover(true);
        setUploadProgress('Preparing image...');
        
        try {
            console.log('Original file:', file.name, Math.round(file.size / 1024), 'KB');
            
            // Compress image before processing
            setUploadProgress('Compressing image...');
            const compressedFile = await compressImage(file, 800, 0.7); // Smaller max width and lower quality for faster upload
            console.log('Compressed file size:', Math.round(compressedFile.size / 1024), 'KB');
            
            // Convert to base64 data URL as fallback (works without Firebase Storage)
            setUploadProgress('Processing image...');
            const reader = new FileReader();
            const dataUrlPromise = new Promise((resolve, reject) => {
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(compressedFile);
            });
            
            const dataUrl = await dataUrlPromise;
            console.log('Image converted to data URL, length:', dataUrl.length);
            
            // Save directly to Firestore as data URL (temporary solution)
            setUploadProgress('Saving image...');
            console.log('Saving image data to Firestore...');
            const docRef = doc(db, `artifacts/${appId}/users/${userId}/notes/${currentDocumentId}`);
            await updateDoc(docRef, { coverImage: dataUrl });
            
            setCurrentDocumentCoverImage(dataUrl);
            setUploadProgress('');
            console.log('Cover image saved successfully');
            
        } catch (error) {
            console.error('Detailed error uploading cover image:', error);
            
            let errorMessage = 'Failed to upload cover image. ';
            if (error.message.includes('quota') || error.message.includes('size')) {
                errorMessage += 'Image is too large. Please try a smaller image.';
            } else {
                errorMessage += `Error: ${error.message}`;
            }
            
            alert(errorMessage);
            setUploadProgress('');
        } finally {
            setIsUploadingCover(false);
        }
    };

    const removeCoverImage = async () => {
        if (!currentDocumentId || !userId || !appId) return;
        
        try {
            // Update Firestore document to remove cover image
            const docRef = doc(db, `artifacts/${appId}/users/${userId}/notes/${currentDocumentId}`);
            await updateDoc(docRef, { coverImage: '' });
            
            setCurrentDocumentCoverImage('');
            console.log('Cover image removed successfully');
        } catch (error) {
            console.error('Error removing cover image:', error);
            alert('Failed to remove cover image. Please try again.');
        }
    };

    // File Management Functions - Phase 2: Enhanced File Upload with LLM Integration
    const handleFileUpload = async (event) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        console.log('File upload starting with enhanced analysis');
        
        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                setFileUploadProgress(`Processing ${file.name} (${i + 1}/${files.length})`);

                // Use our new uploadAndAnalyzeFile function
                const result = await uploadAndAnalyzeFile(file, true);
                
                if (result.success) {
                    console.log(`✅ File processed successfully: ${result.fileName}`);
                } else {
                    console.error(`❌ File processing failed: ${result.error}`);
                    setSaveStatus(`Error processing ${file.name}: ${result.error}`);
                }
            }

            setFileUploadProgress('Upload complete!');
            setSaveStatus(`${files.length} file(s) uploaded and analyzed successfully`);
        } catch (error) {
            console.error('Error uploading files:', error);
            setFileUploadProgress('Upload failed');
            setSaveStatus('Error uploading files');
        } finally {
            // Clear the file input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
            // Clear progress message after 3 seconds
            setTimeout(() => {
                setFileUploadProgress('');
                setFileContentProcessingProgress('');
            }, 3000);
        }
    };

    const triggerFileUpload = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    // ChatGPT-style Plus Button Handlers
    const handlePlusButtonClick = () => {
        setShowPlusOverlay(!showPlusOverlay);
        setShowGoogleDriveOptions(false);
    };

    const handleFileUploadFromOverlay = () => {
        setShowPlusOverlay(false);
        triggerFileUpload();
    };

    const handleGoogleDriveClick = () => {
        setShowGoogleDriveOptions(!showGoogleDriveOptions);
    };

    const handleGoogleDocsConnect = () => {
        setShowPlusOverlay(false);
        setShowGoogleDriveOptions(false);
        setShowAddGoogleLinkModal(true);
    };

    // Phase 4: User Confirmation Modal Handlers
    const showConfirmation = (action, title, message, content = '') => {
        console.log('🔔 showConfirmation called:', { title, message, content: content.substring(0, 100) + '...' });
        setPendingAction(action);
        setConfirmationTitle(title);
        setConfirmationMessage(message);
        setPreviewContent(content);
        setEditedPreviewContent(content);
        setIsEditingPreview(false);
        setShowConfirmationModal(true);
    };

    const handleConfirmAction = async () => {
        if (!pendingAction) return;

        try {
            // Use edited content if user made changes
            const finalContent = isEditingPreview ? editedPreviewContent : previewContent;
            
            // Execute the pending action with the final content
            await pendingAction.execute(finalContent);
            
            // Close modal and reset state
            setShowConfirmationModal(false);
            setPendingAction(null);
            setPreviewContent('');
            setEditedPreviewContent('');
            setIsEditingPreview(false);
            
        } catch (error) {
            console.error('Error executing confirmed action:', error);
            setSaveStatus('Error executing action: ' + error.message);
        }
    };

    const handleRejectAction = () => {
        setShowConfirmationModal(false);
        setPendingAction(null);
        setPreviewContent('');
        setEditedPreviewContent('');
        setIsEditingPreview(false);
        setSaveStatus('Action cancelled by user');
    };

    const handleEditPreview = () => {
        setIsEditingPreview(true);
    };

    const handleSavePreviewEdit = () => {
        setPreviewContent(editedPreviewContent);
        setIsEditingPreview(false);
    };

    const handleCancelPreviewEdit = () => {
        setEditedPreviewContent(previewContent);
        setIsEditingPreview(false);
    };

    // Phase 4: Confirmation-wrapped LLM Functions
    const createNewDocumentWithConfirmation = useCallback(async (title, htmlContent, tags = []) => {
        console.log('📝 createNewDocumentWithConfirmation called:', { title, htmlContent: htmlContent.substring(0, 100) + '...', tags });
        
        const action = {
            execute: async (finalContent) => {
                return await createNewDocument(title, finalContent, tags);
            }
        };

        showConfirmation(
            action,
            'Create New Document',
            `AI wants to create a new document titled "${title}". Please review the content below:`,
            htmlContent
        );

        return { success: true, message: "Awaiting user confirmation..." };
    }, [createNewDocument]);

    const appendContentToDocumentWithConfirmation = useCallback(async (htmlContentToAppend, documentId = null) => {
        const targetDocId = documentId || currentDocumentId;
        const targetDoc = documents.find(doc => doc.id === targetDocId);
        const docTitle = targetDoc ? targetDoc.title : 'Current Document';

        const action = {
            execute: async (finalContent) => {
                return await appendContentToDocument(finalContent, documentId);
            }
        };

        showConfirmation(
            action,
            'Append Content',
            `AI wants to add content to "${docTitle}". Please review the content to be added:`,
            htmlContentToAppend
        );

        return { success: true, message: "Awaiting user confirmation..." };
    }, [appendContentToDocument, currentDocumentId, documents]);

    const handleDeleteFile = async (fileId) => {
        if (!window.confirm('Are you sure you want to delete this file?')) return;

        try {
            const activeUserId = userId || 'anonymous-user';
            console.log('Attempting to delete file with ID:', fileId);
            
            // First, try to find the file document using the provided ID
            let fileDocRef = doc(db, `artifacts/${appId}/users/${activeUserId}/uploaded_files`, fileId);
            let fileDoc = await getDoc(fileDocRef);
            
            // If not found, maybe we need to search by custom ID field (for older files)
            if (!fileDoc.exists()) {
                console.log('Document not found with ID, searching by custom id field...');
                
                // Search for file with matching custom id field
                const filesCollectionRef = collection(db, `artifacts/${appId}/users/${activeUserId}/uploaded_files`);
                const snapshot = await getDocs(query(filesCollectionRef));
                
                let foundDocId = null;
                snapshot.docs.forEach(doc => {
                    const data = doc.data();
                    if (data.id === fileId) {
                        foundDocId = doc.id;
                        console.log('Found file by custom ID field:', fileId, '-> document ID:', doc.id);
                    }
                });
                
                if (foundDocId) {
                    fileDocRef = doc(db, `artifacts/${appId}/users/${activeUserId}/uploaded_files`, foundDocId);
                    fileDoc = await getDoc(fileDocRef);
                } else {
                    console.error('File document not found by either method:', fileId);
                    setSaveStatus('File not found in database');
                    return;
                }
            }

            const fileData = fileDoc.data();
            const downloadURL = fileData.downloadURL;
            const fileName = fileData.fileName;
            
            console.log('Found file to delete:', fileName, 'URL:', downloadURL);
            
            // Extract the file path from the download URL and delete from Storage
            if (downloadURL) {
                try {
                    // Extract the file path from the download URL
                    const url = new URL(downloadURL);
                    const pathMatch = url.pathname.match(/\/o\/(.+)/);
                    if (pathMatch) {
                        const encodedPath = pathMatch[1].split('?')[0]; // Remove query parameters
                        const filePath = decodeURIComponent(encodedPath);
                        
                        // Create storage reference using the extracted path
                        const storageRef = ref(storage, filePath);
                        
                        // Delete the file from Firebase Storage
                        await deleteObject(storageRef);
                        console.log('File deleted from Storage:', filePath);
                    } else {
                        console.warn('Could not extract file path from download URL:', downloadURL);
                    }
                } catch (storageError) {
                    console.warn('Could not delete file from Storage (might already be deleted):', storageError);
                    // Continue with Firestore deletion even if Storage deletion fails
                }
            }
            
            // Delete the metadata from Firestore using the correct document reference
            await deleteDoc(fileDocRef);
            console.log('File metadata deleted from Firestore');
            
            setSaveStatus('File deleted successfully');
        } catch (error) {
            console.error('Error deleting file:', error);
            setSaveStatus('Error deleting file: ' + error.message);
        }
    };

    // Phase 2: Re-analyze file content
    const handleReprocessFile = async (file) => {
        try {
            setIsProcessingFileContent(true);
            setFileContentProcessingProgress(`Re-analyzing ${file.fileName}...`);

            // Extract content from the file
            const extractedContent = await extractFileContent(file, file.downloadURL);

            // Update the file metadata in Firestore
            const activeUserId = userId || 'anonymous-user';
            const fileDoc = doc(db, `artifacts/${appId}/users/${activeUserId}/uploaded_files`, file.id);
            
            await updateDoc(fileDoc, {
                extractedContent: extractedContent,
                contentExtracted: true,
                lastProcessed: Timestamp.now()
            });

            setFileContentProcessingProgress('');
            setSaveStatus('File re-analyzed successfully');
        } catch (error) {
            console.error('Error reprocessing file:', error);
            setFileContentProcessingProgress('');
            setSaveStatus('Error re-analyzing file');
        } finally {
            setIsProcessingFileContent(false);
        }
    };

    const getFileIcon = (fileType) => {
        if (fileType.startsWith('image/')) return '🖼️';
        if (fileType.includes('pdf')) return '📄';
        if (fileType.includes('word') || fileType.includes('document')) return '📝';
        if (fileType.includes('excel') || fileType.includes('spreadsheet')) return '📊';
        if (fileType.includes('powerpoint') || fileType.includes('presentation')) return '📊';
        if (fileType.includes('text')) return '📄';
        if (fileType.includes('zip') || fileType.includes('archive')) return '📦';
        return '📁';
    };

    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    // Function to extract content from public Google Docs
    const extractGoogleDocContent = async (url) => {
        // Convert Google Docs URL to export format for plain text
        // Example: https://docs.google.com/document/d/DOC_ID/edit -> https://docs.google.com/document/d/DOC_ID/export?format=txt
        
        let exportUrl = '';
        
        if (url.includes('/document/d/')) {
            // Extract document ID
            const match = url.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
            if (match && match[1]) {
                const docId = match[1];
                exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
            }
        }
        
        if (!exportUrl) {
            throw new Error('Invalid Google Docs URL format');
        }
        
        try {
            const response = await fetch(exportUrl, {
                method: 'GET',
                mode: 'cors',
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: Document may not be publicly accessible`);
            }
            
            const text = await response.text();
            
            if (text.trim().length === 0) {
                throw new Error('Document appears to be empty or not accessible');
            }
            
            return text;
        } catch (error) {
            if (error.message.includes('CORS') || error.message.includes('cors')) {
                throw new Error('Document is not publicly accessible or sharing settings restrict access');
            }
            throw error;
        }
    };

    // File Management Functions - Phase 2: Google Links
    const handleAddGoogleLink = async (title, url) => {
        if (!title.trim() || !url.trim()) {
            alert('Please enter both title and URL');
            return;
        }

        // Basic URL validation
        if (!url.startsWith('https://docs.google.com') && !url.startsWith('https://sheets.google.com')) {
            alert('Please enter a valid Google Docs or Sheets URL');
            return;
        }

        try {
            const linkType = url.includes('docs.google.com') ? 'google_doc' : 'google_sheet';

            // Try to extract content if it's a public Google Doc
            let extractedContent = '';
            let contentExtracted = false;
            
            if (linkType === 'google_doc') {
                try {
                    setSaveStatus('Attempting to extract content from Google Doc...');
                    const content = await extractGoogleDocContent(url);
                    if (content) {
                        extractedContent = content;
                        contentExtracted = true;
                        setSaveStatus('Content extracted successfully!');
                    }
                } catch (error) {
                    console.log('Could not extract content automatically:', error.message);
                    setSaveStatus('Link added (content extraction failed - document may not be public)');
                }
            }

            const linkMetadata = {
                title: title.trim(),
                url: url.trim(),
                linkType: linkType,
                addDate: Timestamp.now(),
                associatedPageId: currentDocumentId || null,
                // Add extracted content if available
                extractedContent: extractedContent,
                contentExtracted: contentExtracted,
                lastProcessed: Timestamp.now()
            };

            const activeUserId = userId || 'anonymous-user';
            await addDoc(collection(db, `artifacts/${appId}/users/${activeUserId}/google_links`), linkMetadata);
            console.log('Google link added successfully');

            // Reset form
            setGoogleLinkTitle('');
            setGoogleLinkUrl('');
            setShowAddGoogleLinkModal(false);
            
            if (!contentExtracted) {
                setSaveStatus('Google link added (for AI analysis, ensure doc is public or copy/paste content)');
            }
        } catch (error) {
            console.error('Error adding Google link:', error);
            setSaveStatus('Error adding Google link');
        }
    };

    const handleDeleteGoogleLink = async (linkId) => {
        if (!window.confirm('Are you sure you want to delete this link?')) return;

        try {
            const activeUserId = userId || 'anonymous-user';
            console.log('Attempting to delete Google link with ID:', linkId);
            console.log('Collection path:', `artifacts/${appId}/users/${activeUserId}/google_links`);
            
            const linkDocRef = doc(db, `artifacts/${appId}/users/${activeUserId}/google_links`, linkId);
            await deleteDoc(linkDocRef);
            console.log('Google link deleted successfully');
            setSaveStatus('Link deleted');
        } catch (error) {
            console.error('Error deleting Google link:', error);
            console.error('Full error details:', {
                code: error.code,
                message: error.message,
                linkId: linkId,
                appId: appId,
                userId: userId
            });
            setSaveStatus('Error deleting link: ' + error.message);
        }
    };

    const getLinkIcon = (linkType) => {
        if (linkType === 'google_doc') return '📄';
        if (linkType === 'google_sheet') return '📊';
        return '🔗';
    };

    const buildDocumentTree = (docs) => {
        const tree = [];
        const docMap = {};
        
        // Create a map of all documents
        docs.forEach(doc => {
            docMap[doc.id] = { ...doc, children: [] };
        });
        
        // Build the tree structure
        docs.forEach(doc => {
            if (doc.parentId && docMap[doc.parentId]) {
                // This document has a parent, add it as a child
                docMap[doc.parentId].children.push(docMap[doc.id]);
            } else {
                // This is a top-level document
                tree.push(docMap[doc.id]);
            }
        });
        
        // Sort each level by order field (or title if no order)
        const sortLevel = (items) => {
            items.sort((a, b) => {
                if (a.order !== undefined && b.order !== undefined) {
                    return a.order - b.order;
                }
                return (a.title || 'Untitled').localeCompare(b.title || 'Untitled');
            });
            items.forEach(item => {
                if (item.children.length > 0) {
                    sortLevel(item.children);
                }
            });
        };
        
        sortLevel(tree);
        return tree;
    };

    // Update tree whenever documents change
    useEffect(() => {
        const tree = buildDocumentTree(documents);
        setDocumentTree(tree);
    }, [documents]);

    const handleAddDocument = async (template = { name: 'Blank Page', title: '', content: '' }, parentId = null) => {
        if (!db || !userId || !appId) {
            console.error("Firestore: Database, user, or appId not ready to add document.");
            return;
        }
        const newDocRef = collection(db, `artifacts/${appId}/users/${userId}/notes`);
        const newDocId = crypto.randomUUID();
        const newDocData = {
            id: newDocId,
            title: template.title,
            content: template.content,
            tags: [],
            parentId: parentId,
            order: Date.now(), // Use timestamp for initial ordering
            icon: '',
            coverImage: '',
            linkedPages: [],
            createdAt: new Date(),
            updatedAt: new Date()
        };
        try {
            await setDoc(doc(newDocRef, newDocId), newDocData);
            setCurrentDocumentId(newDocId);
            setCurrentDocumentContent(newDocData.content);
            setCurrentDocumentTitle(newDocData.title);
            setCurrentDocumentTags(newDocData.tags);
            setLlmResponse('');
            setSaveStatus('All changes saved');
            
            // Expand parent node if adding a child
            if (parentId) {
                setExpandedNodes(prev => new Set([...prev, parentId]));
            }
        } catch (e) {
            console.error("Error adding document: ", e);
        } finally {
            setShowTemplateMenu(false);
        }
    };

    const handleDeleteDocument = async (docId = null) => {
        const documentIdToDelete = docId || currentDocumentId;
        if (!db || !userId || !documentIdToDelete || !appId) {
            console.error("Firestore: Database, user, document ID, or appId not ready to delete.");
            return;
        }
        const docRef = doc(db, `artifacts/${appId}/users/${userId}/notes`, documentIdToDelete);
        try {
            await deleteDoc(docRef);
            setSaveStatus('Page deleted');
            // If we deleted the current document, clear the editor
            if (documentIdToDelete === currentDocumentId) {
                setCurrentDocumentId(null);
                setCurrentDocumentContent('');
                setCurrentDocumentTitle('');
                setCurrentDocumentTags([]);
                setCurrentDocumentIcon('');
                setCurrentDocumentCoverImage('');
            }
        } catch (e) {
            console.error("Error deleting document: ", e);
            setSaveStatus('Error deleting page');
        }
    };



    const askLlm = async (customQuestion = null, contextText = null) => {
        // Ensure question is a string
        const question = typeof customQuestion === 'string' ? customQuestion : llmQuestion;
        
        if (!question || typeof question !== 'string' || !question.trim()) {
            setLlmResponse("Please enter a question.");
            return;
        }

        setLlmLoading(true);
        setLlmLoadingMessage('Preparing your question...');
        
        // Clear previous search suggestions
        setExternalSearchSuggestions([]);
        
        // Add user question to chat history
        const userMessage = { role: "user", parts: [{ text: question }] };
        const newChatHistory = [...chatHistory, userMessage];
        setChatHistory(newChatHistory);
        
        // Clear the input field
        setLlmQuestion('');

        const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
        if (!apiKey) {
            const errorMsg = "❌ Configuration Error: API key not found. Please set REACT_APP_GEMINI_API_KEY in your environment.";
            setLlmResponse(errorMsg);
            // Add error to chat history
            setChatHistory([...newChatHistory, { role: "model", parts: [{ text: errorMsg }] }]);
            setLlmLoading(false);
            setLlmLoadingMessage('');
            return;
        }

        let conversationContext = "";
        let payload;

        // If we have context text (selected text), handle it specially
        if (contextText) {
            setLlmLoadingMessage('Searching document for selected text...');
            
            // Get current document content for context
            let documentContent = '';
            if (currentDocumentContent) {
                try {
                    const parsed = JSON.parse(currentDocumentContent);
                    if (parsed.blocks) {
                        documentContent = convertEditorToPlainText(parsed);
                    } else {
                        documentContent = convertHtmlToPlainText(currentDocumentContent);
                    }
                } catch (e) {
                    documentContent = convertHtmlToPlainText(currentDocumentContent);
                }
            }
            
            // For selected text queries, include both selected text and document context
            conversationContext = `You are a helpful AI assistant. I need you to provide information about the selected text, using the full document content for context.

QUESTION: ${question}

SELECTED TEXT: "${contextText}"

FULL DOCUMENT CONTENT:
${documentContent}

Instructions:
- Focus on the selected text: "${contextText}"
- Use the full document content to provide comprehensive information
- If the selected text appears elsewhere in the document, mention that
- Provide relevant background information from the document
- If the selected text refers to something (person, place, concept), explain it based on the document context
- Be informative and helpful
- Also suggest 3-5 concise search terms for finding additional information online

IMPORTANT: Return your response as a JSON object with exactly this structure:
{
  "answer": "Your comprehensive answer here",
  "search_terms": ["search term 1", "search term 2", "search term 3"]
}`;

            payload = {
                contents: [{ role: "user", parts: [{ text: conversationContext }] }],
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "OBJECT",
                        properties: {
                            answer: {
                                type: "STRING"
                            },
                            search_terms: {
                                type: "ARRAY",
                                items: {
                                    type: "STRING"
                                }
                            }
                        },
                        required: ["answer", "search_terms"]
                    }
                }
            };
        } else {
            // Original document-based query with conversation history
            if (documents.length === 0) {
                const errorMsg = "📝 No Documents Found: Please create some pages first to use the AI assistant.";
                setLlmResponse(errorMsg);
                setChatHistory([...newChatHistory, { role: "model", parts: [{ text: errorMsg }] }]);
                setLlmLoading(false);
                setLlmLoadingMessage('');
                return;
            }

            setLlmLoadingMessage('Processing your documents...');

            // Build context from documents (only if this is the first message in conversation)
            if (newChatHistory.length === 1) {
                // First message - include document context
                const documentsText = documents.map(doc => {
                    let content = '';
                    if (doc.content) {
                        try {
                            const parsed = JSON.parse(doc.content);
                            if (parsed.blocks) {
                                content = convertEditorToPlainText(parsed);
                            } else {
                                content = convertHtmlToPlainText(doc.content);
                            }
                        } catch (e) {
                            content = convertHtmlToPlainText(doc.content);
                        }
                    }
                    return `Document: ${doc.title || 'Untitled'}\nContent: ${content}\nTags: ${(doc.tags || []).join(', ')}`;
                }).join('\n\n---\n\n');

                // Phase 2: Include uploaded file contents
                const uploadedFilesText = uploadedFiles.filter(file => file.extractedContent).map(file => {
                    return `Uploaded File: ${file.fileName}\nFile Type: ${file.fileType}\nSize: ${Math.round(file.fileSize / 1024)}KB\nContent:\n${file.extractedContent}`;
                }).join('\n\n---\n\n');

                // Phase 3: Include Google Links (with content if available)
                const googleLinksText = googleLinks.map(link => {
                    let linkInfo = `Google Link: ${link.title}\nURL: ${link.url}\nType: ${link.linkType === 'google_doc' ? 'Google Doc' : 'Google Sheet'}`;
                    
                    if (link.contentExtracted && link.extractedContent) {
                        linkInfo += `\nContent:\n${link.extractedContent}`;
                    } else {
                        linkInfo += `\nNote: Content not accessible - document may not be public. User should copy/paste relevant content if analysis is needed.`;
                    }
                    
                    return linkInfo;
                }).join('\n\n---\n\n');

                // Combine documents, files, and Google links
                const allContent = [documentsText, uploadedFilesText, googleLinksText].filter(text => text.trim()).join('\n\n===== UPLOADED FILES =====\n\n');

                const contextualQuestion = `You are a helpful AI assistant with access to document creation tools and the user's personal knowledge base. You can create documents, add content, and provide information from both your training data and the user's files.

USER QUESTION: ${question}

USER'S KNOWLEDGE BASE:
${allContent}

Instructions:
1. **ALWAYS use function calls for document operations** - Never just describe what you'll do, actually do it
2. **For document creation requests**: IMMEDIATELY call createNewDocument function with comprehensive HTML content
3. **For content addition requests**: IMMEDIATELY call appendContentToDocument function
4. **For information requests about topics**: CREATE a document about the topic using createNewDocument
5. **For research topics**: CREATE comprehensive documents with your knowledge using createNewDocument
6. **Be proactive**: When users ask about ANY topic, create a document about it
7. **Use HTML formatting**: Include proper <h1>, <h2>, <p>, <ul>, <li>, <strong>, <em> tags

CRITICAL: When a user asks to "create a document about X" or asks about any topic, you MUST call the createNewDocument function. Do not just say you will create it - actually call the function.

CAPABILITIES:
- I MUST use createNewDocument function for any document creation
- I MUST use appendContentToDocument function for adding content
- I can search through uploaded files with searchFileContent
- I provide comprehensive information using my training data
- I suggest search terms for additional research

RESPONSE FORMAT: 
- For document creation: Call createNewDocument function with comprehensive HTML content
- For content addition: Call appendContentToDocument function with HTML content
- For information only: Provide a helpful response and suggest search terms for additional research`;

                // Include recent chat history (last 8 messages to manage token usage)
                const recentHistory = newChatHistory.slice(-1);
                recentHistory[0] = { role: "user", parts: [{ text: contextualQuestion }] };
                payload = { 
                    contents: recentHistory
                    // Removed JSON schema to allow function calling
                };
            } else {
                // Continuing conversation - use recent history with system context
                const recentHistory = newChatHistory.slice(-8); // Last 8 messages
                
                // Add system context for continuing conversations
                const systemMessage = {
                    role: "user",
                    parts: [{
                        text: `You are a helpful AI assistant with document creation capabilities. 

CRITICAL INSTRUCTIONS:
- When users ask to "create a document" or ask about any topic, you MUST call the createNewDocument function
- When users ask to add content, you MUST call the appendContentToDocument function
- Never just say you will create something - actually call the function
- Use comprehensive HTML content with proper formatting

AVAILABLE FUNCTIONS:
- createNewDocument: MUST use for any document creation requests
- appendContentToDocument: MUST use for adding content to documents
- searchFileContent: Use to search uploaded files

Be proactive and actually CREATE documents when users ask about topics, don't just describe what you would create.`
                    }]
                };
                
                payload = { contents: [systemMessage, ...recentHistory] };
            }
        }

        // Add function calling tools to the payload
        const tools = [{
            function_declarations: [
                {
                    name: "createNewDocument",
                    description: "Create a new document with HTML content. Use this when the user asks to create a document, wants information about a topic (create a research document), or when you want to provide comprehensive information that would be useful as a saved document.",
                    parameters: {
                        type: "OBJECT",
                        properties: {
                            title: {
                                type: "STRING",
                                description: "The title for the new document"
                            },
                            htmlContent: {
                                type: "STRING", 
                                description: "The HTML content for the document. Use proper HTML tags like <h1>, <h2>, <p>, <ul>, <li>, <strong>, <em>, etc."
                            },
                            tags: {
                                type: "ARRAY",
                                items: { type: "STRING" },
                                description: "Optional array of tags for the document"
                            }
                        },
                        required: ["title", "htmlContent"]
                    }
                },
                {
                    name: "appendContentToDocument", 
                    description: "Append HTML content to the current document or a specific document. Use this when the user asks to add content to an existing document, or when you want to add related information to an existing document.",
                    parameters: {
                        type: "OBJECT",
                        properties: {
                            htmlContentToAppend: {
                                type: "STRING",
                                description: "The HTML content to append. Use proper HTML tags like <h1>, <h2>, <p>, <ul>, <li>, <strong>, <em>, etc."
                            },
                            documentId: {
                                type: "STRING",
                                description: "Optional document ID. If not provided, will append to current document"
                            }
                        },
                        required: ["htmlContentToAppend"]
                    }
                },
                {
                    name: "uploadAndAnalyzeFile",
                    description: "Upload a file and extract its content for analysis. Use this when the user wants to upload a document, PDF, or text file.",
                    parameters: {
                        type: "OBJECT",
                        properties: {
                            fileName: {
                                type: "STRING",
                                description: "The name of the file to upload"
                            },
                            extractContent: {
                                type: "BOOLEAN",
                                description: "Whether to extract and analyze the file content (default: true)"
                            }
                        },
                        required: ["fileName"]
                    }
                },
                {
                    name: "searchFileContent",
                    description: "Search through uploaded file contents. Use this when the user wants to find information in their uploaded files.",
                    parameters: {
                        type: "OBJECT",
                        properties: {
                            searchQuery: {
                                type: "STRING",
                                description: "The text to search for in uploaded files"
                            },
                            fileId: {
                                type: "STRING",
                                description: "Optional specific file ID to search in. If not provided, searches all files"
                            }
                        },
                        required: ["searchQuery"]
                    }
                },
                {
                    name: "suggestTitleAndIcon",
                    description: "Suggests alternative titles and relevant emojis or small image URLs for the current document based on its content. Provide a list of up to 4 suggestions.",
                    parameters: {
                        type: "OBJECT",
                        properties: {
                            suggestions: {
                                type: "ARRAY",
                                items: {
                                    type: "OBJECT",
                                    properties: {
                                        title: { type: "STRING", description: "A concise, descriptive title suggestion." },
                                        icon: { type: "STRING", description: "A relevant emoji or a placeholder image URL (e.g., from placehold.co) for the icon." }
                                    },
                                    required: ["title", "icon"]
                                }
                            }
                        },
                        required: ["suggestions"]
                    }
                },
                {
                    name: "suggestTags",
                    description: "Suggests relevant tags (keywords) for the current document based on its content. Provide a list of up to 5 concise tag strings.",
                    parameters: {
                        type: "OBJECT",
                        properties: {
                            tags: {
                                type: "ARRAY",
                                items: { type: "STRING", description: "A concise tag string." }
                            }
                        },
                        required: ["tags"]
                    }
                }
            ]
        }];

        // Add tools to payload for function calling
        if (payload.contents) {
            payload.tools = tools;
        }

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

        setLlmLoadingMessage('Connecting to AI...');
        
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();

            if (result.candidates && result.candidates.length > 0 &&
                result.candidates[0].content && result.candidates[0].content.parts &&
                result.candidates[0].content.parts.length > 0) {
                
                const candidate = result.candidates[0];
                const parts = candidate.content.parts;
                
                // Check if this is a function call response
                if (parts.some(part => part.functionCall)) {
                    setLlmLoadingMessage('AI is taking action...');
                    
                    let functionResults = [];
                    let responseText = "I'll help you with that. ";
                    
                    // Process each function call
                    for (const part of parts) {
                        if (part.functionCall) {
                            const functionName = part.functionCall.name;
                            const functionArgs = part.functionCall.args;
                            
                            console.log(`🤖 AI calling function: ${functionName}`, functionArgs);
                            
                            let result;
                            if (functionName === 'createNewDocument') {
                                result = await createNewDocumentWithConfirmation(
                                    functionArgs.title,
                                    functionArgs.htmlContent,
                                    functionArgs.tags
                                );
                                if (result.success) {
                                    responseText += `📋 Document creation pending your approval. Please review and confirm the content. `;
                                } else {
                                    responseText += `❌ Failed to prepare document: ${result.error}. `;
                                }
                            } else if (functionName === 'appendContentToDocument') {
                                result = await appendContentToDocumentWithConfirmation(
                                    functionArgs.htmlContentToAppend,
                                    functionArgs.documentId
                                );
                                if (result.success) {
                                    responseText += `📋 Content addition pending your approval. Please review and confirm the content. `;
                                } else {
                                    responseText += `❌ Failed to prepare content: ${result.error}. `;
                                }
                            } else if (functionName === 'uploadAndAnalyzeFile') {
                                responseText += `📁 File upload functionality requires user interaction. Please use the file upload button in the interface. `;
                            } else if (functionName === 'searchFileContent') {
                                result = await searchFileContent(
                                    functionArgs.searchQuery,
                                    functionArgs.fileId
                                );
                                if (result.success) {
                                    responseText += `🔍 Found ${result.results.length} matches in uploaded files. `;
                                    if (result.results.length > 0) {
                                        responseText += `Results: ${result.results.map(r => `${r.fileName}: "${r.context.substring(0, 100)}..."`).join('; ')}`;
                                    }
                                } else {
                                    responseText += `❌ Search failed: ${result.error}. `;
                                }
                            } else if (functionName === 'suggestTitleAndIcon') {
                                // Handle AI Title & Icon Suggestions
                                setAiTitleIconSuggestions(functionArgs.suggestions);
                                setShowAiTitleSuggestions(true);
                                setLlmResponse(''); // Clear response as suggestions are the primary output
                                responseText = ''; // Don't add to response text
                            } else if (functionName === 'suggestTags') {
                                // Handle AI Tag Suggestions
                                setAiTagSuggestions(functionArgs.tags);
                                setLlmResponse(''); // Clear response as suggestions are the primary output
                                responseText = ''; // Don't add to response text
                            }
                            
                            functionResults.push({
                                name: functionName,
                                response: result
                            });
                        }
                    }
                    
                    // Set the response
                    setLlmResponse(responseText);
                    setExternalSearchSuggestions([]);
                    
                    // Add to chat history
                    const aiMessage = { role: "model", parts: [{ text: responseText }] };
                    setChatHistory([...newChatHistory, aiMessage]);
                    
                } else {
                    // Regular text response (not a function call)
                    const aiResponseText = parts[0].text;
                    console.log('📝 AI text response (no function call):', aiResponseText);
                    
                    try {
                        // Try to parse as structured JSON response
                        const parsedResponse = JSON.parse(aiResponseText);
                        
                        if (parsedResponse.answer && parsedResponse.search_terms) {
                            // Structured response received
                            setLlmResponse(parsedResponse.answer);
                            setExternalSearchSuggestions(parsedResponse.search_terms || []);
                            
                            // Add AI response to chat history (store the answer part)
                            const aiMessage = { role: "model", parts: [{ text: parsedResponse.answer }] };
                            setChatHistory([...newChatHistory, aiMessage]);
                        } else {
                            // Fallback: treat as regular text response
                            setLlmResponse(aiResponseText);
                            setExternalSearchSuggestions([]);
                            
                            const aiMessage = { role: "model", parts: [{ text: aiResponseText }] };
                            setChatHistory([...newChatHistory, aiMessage]);
                        }
                    } catch (parseError) {
                        // Fallback: treat as regular text response if JSON parsing fails
                        console.log('Response not in JSON format, treating as plain text');
                        setLlmResponse(aiResponseText);
                        setExternalSearchSuggestions([]);
                        
                        const aiMessage = { role: "model", parts: [{ text: aiResponseText }] };
                        setChatHistory([...newChatHistory, aiMessage]);
                    }
                }
                
            } else {
                const errorMsg = "⚠️ AI Response Error: I couldn't generate a response. Please try again.";
                setLlmResponse(errorMsg);
                setExternalSearchSuggestions([]);
                setChatHistory([...newChatHistory, { role: "model", parts: [{ text: errorMsg }] }]);
            }
        } catch (error) {
            console.error("Error calling Gemini API:", error);
            let errorMsg = "🔌 Connection Error: Unable to reach AI service. ";
            if (error.message.includes('fetch')) {
                errorMsg += "Please check your internet connection.";
            } else if (error.message.includes('API key')) {
                errorMsg += "Please verify your API key is correct.";
            } else {
                errorMsg += "Please try again in a moment.";
            }
            setLlmResponse(errorMsg);
            setExternalSearchSuggestions([]);
            setChatHistory([...newChatHistory, { role: "model", parts: [{ text: errorMsg }] }]);
        } finally {
            setLlmLoading(false);
            setLlmLoadingMessage('');
        }
    };

    const handleDocumentSelect = (docId) => {
        setCurrentDocumentId(docId);
        setLlmResponse('');
        setShowSidebarMobile(false);
    };

    const templates = [
        { name: 'Blank Page', title: '', content: '' },
        { 
            name: 'Meeting Notes', 
            title: 'Meeting Notes', 
            content: JSON.stringify({
                "blocks": [
                    {"type": "header", "data": {"text": "Meeting Notes", "level": 2}},
                    {"type": "paragraph", "data": {"text": "<strong>Date:</strong> "}},
                    {"type": "paragraph", "data": {"text": "<strong>Attendees:</strong> "}},
                    {"type": "paragraph", "data": {"text": "<strong>Topics:</strong> "}},
                    {"type": "header", "data": {"text": "Action Items", "level": 3}},
                    {"type": "list", "data": {"style": "unordered", "items": ["Task 1", "Task 2"]}}
                ]
            })
        },
        { 
            name: 'Daily Journal', 
            title: 'Daily Journal', 
            content: JSON.stringify({
                "blocks": [
                    {"type": "header", "data": {"text": `Daily Journal - ${new Date().toLocaleDateString()}`, "level": 2}},
                    {"type": "paragraph", "data": {"text": "<strong>Mood:</strong> "}},
                    {"type": "paragraph", "data": {"text": "<strong>Highlights:</strong> "}},
                    {"type": "paragraph", "data": {"text": "<strong>Challenges:</strong> "}},
                    {"type": "paragraph", "data": {"text": "<strong>Learnings:</strong> "}}
                ]
            })
        },
        { 
            name: 'To-Do List', 
            title: 'To-Do List', 
            content: JSON.stringify({
                "blocks": [
                    {"type": "header", "data": {"text": "To-Do List", "level": 2}},
                    {"type": "checklist", "data": {"items": [
                        {"text": "Item 1", "checked": false},
                        {"text": "Item 2", "checked": false},
                        {"text": "Item 3", "checked": false}
                    ]}}
                ]
            })
        }
    ];

    const filteredDocuments = documents.filter(doc => {
        const titleMatch = (doc.title || '').toLowerCase().includes(searchTerm.toLowerCase());
        const tagMatch = doc.tags && doc.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
        
        // Handle both Editor.js (JSON) and HTML content for search
        let contentMatch = false;
        if (doc.content) {
            try {
                // Try to parse as Editor.js format first
                const parsed = JSON.parse(doc.content);
                if (parsed.blocks) {
                    const plainText = convertEditorToPlainText(parsed);
                    contentMatch = plainText.toLowerCase().includes(searchTerm.toLowerCase());
                } else {
                    // Fallback to HTML conversion
                    contentMatch = convertHtmlToPlainText(doc.content).toLowerCase().includes(searchTerm.toLowerCase());
                }
            } catch (e) {
                // Not JSON, treat as HTML/plain text
                contentMatch = convertHtmlToPlainText(doc.content).toLowerCase().includes(searchTerm.toLowerCase());
            }
        }
        
        return titleMatch || contentMatch || tagMatch;
    });

    // Tree node expand/collapse
    const toggleNodeExpansion = (nodeId) => {
        setExpandedNodes(prev => {
            const newSet = new Set(prev);
            if (newSet.has(nodeId)) {
                newSet.delete(nodeId);
            } else {
                newSet.add(nodeId);
            }
            return newSet;
        });
    };

    // Tree node component for hierarchical display
    const TreeNode = ({ node, level = 0, onAddChild }) => {
        const hasChildren = node.children && node.children.length > 0;
        const isExpanded = expandedNodes.has(node.id);
        const isSelected = currentDocumentId === node.id;
        const isDragTarget = dropTarget === node.id;
        const isDragged = draggedNode?.id === node.id;
        const showDropBefore = isDragTarget && dropPosition === 'before';
        const showDropAfter = isDragTarget && dropPosition === 'after';
        const showDropInside = isDragTarget && dropPosition === 'inside';
        
        return (
            <div key={node.id}>
                {/* Drop indicator before */}
                {showDropBefore && (
                    <div 
                        className="h-0.5 bg-blue-500 mx-3 rounded"
                        style={{ marginLeft: `${8 + level * 16}px` }}
                    />
                )}
                
                <div 
                    draggable="true"
                    onDragStart={(e) => handleDragStart(e, node)}
                    onDragOver={(e) => handleDragOver(e, node)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, node)}
                    className={`flex items-center py-1 px-2 mx-1 rounded-md cursor-pointer group transition-all duration-200
                        ${isSelected 
                            ? (isDarkMode ? 'bg-gray-800 text-gray-100' : 'bg-gray-200 text-gray-900') 
                            : (isDarkMode ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-700 hover:bg-gray-100')
                        }
                        ${showDropInside ? (isDarkMode ? 'ring-1 ring-blue-400 bg-blue-900/20' : 'ring-1 ring-blue-400 bg-blue-50') : ''}
                        ${isDragged ? 'opacity-50' : ''}
                    `}
                    style={{ paddingLeft: `${8 + level * 16}px` }}
                >
                    {/* Expand/Collapse Button */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (hasChildren) {
                                toggleNodeExpansion(node.id);
                            }
                        }}
                        className={`w-4 h-4 mr-1 flex items-center justify-center flex-shrink-0
                            ${hasChildren 
                                ? (isDarkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700') 
                                : 'invisible'
                            }
                        `}
                    >
                        {hasChildren && (
                            <svg 
                                className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                                fill="currentColor" 
                                viewBox="0 0 20 20"
                            >
                                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                            </svg>
                        )}
                    </button>
                    
                    {/* Document Icon and Title */}
                    <div 
                        className="flex-1 flex items-center min-w-0"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleDocumentSelect(node.id);
                        }}
                    >
                        <span className="mr-2 text-sm flex-shrink-0">
                            {node.icon || (hasChildren ? '📁' : '📄')}
                        </span>
                        <span className="truncate text-sm">
                            {node.title || 'Untitled'}
                        </span>
                    </div>
                    
                    {/* Hover Actions */}
                    <div className="flex items-center ml-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        {/* Add Child Button */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onAddChild(node.id);
                            }}
                            className={`p-1 rounded-md transition-colors flex-shrink-0
                                ${isDarkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500'}
                            `}
                            title="Add sub-page"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
                            </svg>
                        </button>
                        
                        {/* Overflow Menu Button */}
                        <div className="relative overflow-menu">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenOverflowMenu(openOverflowMenu === node.id ? null : node.id);
                                }}
                                className={`p-1 rounded-md transition-colors flex-shrink-0
                                    ${isDarkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500'}
                                `}
                                title="More options"
                            >
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"/>
                                </svg>
                            </button>
                            
                            {/* Overflow Menu Dropdown */}
                            {openOverflowMenu === node.id && (
                                <div className={`absolute right-0 top-6 z-50 py-1 rounded-md shadow-lg border min-w-32 overflow-menu
                                    ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}
                                `}>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (window.confirm(`Are you sure you want to delete "${node.title || 'Untitled'}"?`)) {
                                                if (currentDocumentId === node.id) {
                                                    setCurrentDocumentId(null);
                                                }
                                                handleDeleteDocument(node.id);
                                            }
                                            setOpenOverflowMenu(null);
                                        }}
                                        className={`flex items-center w-full px-3 py-1.5 text-sm text-left transition-colors
                                            ${isDarkMode ? 'text-red-400 hover:bg-gray-700' : 'text-red-600 hover:bg-gray-100'}
                                        `}
                                    >
                                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                        </svg>
                                        Delete
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                
                {/* Child Nodes */}
                {hasChildren && isExpanded && (
                    <div>
                        {node.children.map(child => (
                            <TreeNode 
                                key={child.id} 
                                node={child} 
                                level={level + 1} 
                                onAddChild={onAddChild}
                            />
                        ))}
                    </div>
                )}
                
                {/* Drop indicator after */}
                {showDropAfter && (
                    <div 
                        className="h-0.5 bg-blue-500 mx-3 rounded"
                        style={{ marginLeft: `${8 + level * 16}px` }}
                    />
                )}
            </div>
        );
    };

    // Generate breadcrumb path for current document
    const getBreadcrumbPath = useCallback((docId) => {
        if (!docId || !documents.length) return [];
        
        const path = [];
        let currentDocId = docId;
        
        while (currentDocId) {
            const currentDoc = documents.find(doc => doc.id === currentDocId);
            if (!currentDoc) break;
            
            path.unshift(currentDoc);
            currentDocId = currentDoc.parentId;
        }
        
        return path;
    }, [documents]);

    // Drag and drop handlers
    const handleDragStart = (e, node) => {
        setDraggedNode(node);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', node.id);
    };

    const handleDragOver = (e, targetNode) => {
        e.preventDefault();
        if (!draggedNode || draggedNode.id === targetNode.id) return;
        
        // Prevent dropping a parent onto its own child
        if (isDescendant(targetNode.id, draggedNode.id)) return;
        
        // Calculate drop position based on mouse position within the element
        const rect = e.currentTarget.getBoundingClientRect();
        const mouseY = e.clientY;
        const elementHeight = rect.height;
        const relativeY = mouseY - rect.top;
        
        let position = 'inside'; // default to nesting
        
        // Determine drop position based on mouse position
        if (relativeY < elementHeight * 0.25) {
            position = 'before'; // Top quarter - insert before
        } else if (relativeY > elementHeight * 0.75) {
            position = 'after'; // Bottom quarter - insert after  
        } else {
            position = 'inside'; // Middle half - nest inside
        }
        
        setDropTarget(targetNode.id);
        setDropPosition(position);
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDragLeave = () => {
        setDropTarget(null);
        setDropPosition(null);
    };

    const handleDrop = async (e, targetNode) => {
        e.preventDefault();
        if (!draggedNode || !db || !userId || !appId || !dropPosition) return;
        
        // Prevent dropping onto self or descendants
        if (draggedNode.id === targetNode.id || isDescendant(targetNode.id, draggedNode.id)) {
            setDraggedNode(null);
            setDropTarget(null);
            setDropPosition(null);
            return;
        }

        try {
            const docRef = doc(db, `artifacts/${appId}/users/${userId}/notes/${draggedNode.id}`);
            
            if (dropPosition === 'inside') {
                // Nest inside the target (existing behavior)
                await updateDoc(docRef, {
                    parentId: targetNode.id,
                    order: Date.now(), // New order for nested item
                    updatedAt: new Date()
                });
                
                // Expand the target node to show the moved item
                setExpandedNodes(prev => new Set([...prev, targetNode.id]));
                setSaveStatus('Moved into folder');
            } else {
                // Insert before or after the target (reordering)
                const targetDoc = documents.find(doc => doc.id === targetNode.id);
                const newParentId = targetDoc.parentId; // Same parent as target
                
                // Calculate new order based on position
                let newOrder;
                const siblings = documents.filter(doc => doc.parentId === newParentId)
                    .sort((a, b) => (a.order || 0) - (b.order || 0));
                const targetIndex = siblings.findIndex(doc => doc.id === targetNode.id);
                
                if (dropPosition === 'before') {
                    if (targetIndex > 0) {
                        const prevSibling = siblings[targetIndex - 1];
                        const targetOrder = targetDoc.order || 0;
                        const prevOrder = prevSibling.order || 0;
                        newOrder = (targetOrder + prevOrder) / 2;
                    } else {
                        newOrder = (targetDoc.order || 0) - 1000;
                    }
                } else { // after
                    if (targetIndex < siblings.length - 1) {
                        const nextSibling = siblings[targetIndex + 1];
                        const targetOrder = targetDoc.order || 0;
                        const nextOrder = nextSibling.order || 0;
                        newOrder = (targetOrder + nextOrder) / 2;
                    } else {
                        newOrder = (targetDoc.order || 0) + 1000;
                    }
                }
                
                await updateDoc(docRef, {
                    parentId: newParentId,
                    order: newOrder,
                    updatedAt: new Date()
                });
                
                setSaveStatus(`Moved ${dropPosition} target`);
            }
        } catch (error) {
            console.error('Error moving document:', error);  
            setSaveStatus('Error moving document');
        }

        setDraggedNode(null);
        setDropTarget(null);
        setDropPosition(null);
    };

    // Check if nodeId is a descendant of ancestorId
    const isDescendant = (nodeId, ancestorId) => {
        const node = documents.find(doc => doc.id === nodeId);
        if (!node) return false;
        if (node.parentId === ancestorId) return true;
        if (node.parentId) return isDescendant(node.parentId, ancestorId);
        return false;
    };

    const toggleDarkMode = () => {
        setIsDarkMode(prevMode => !prevMode);
    };

    // Handle right panel resize
    const dragStartXRef = useRef(null);
    const dragStartWidthRef = useRef(null);

    const handleMouseDown = (e) => {
        e.preventDefault();
        resizeRef.current = true;
        dragStartXRef.current = e.clientX;
        dragStartWidthRef.current = rightPanelWidth;
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    };

    const handleMouseMove = (e) => {
        if (!resizeRef.current || dragStartXRef.current === null || dragStartWidthRef.current === null) return;
        
        const windowWidth = window.innerWidth;
        const mouseDeltaX = e.clientX - dragStartXRef.current;
        const widthDeltaPercent = (mouseDeltaX / windowWidth) * 100;
        const newWidth = dragStartWidthRef.current - widthDeltaPercent; // Subtract because moving right should decrease right panel width
        
        // Constrain width between 15% and 50%
        const constrainedWidth = Math.max(15, Math.min(50, newWidth));
        setRightPanelWidth(constrainedWidth);
    };

    const handleMouseUp = () => {
        resizeRef.current = false;
        dragStartXRef.current = null;
        dragStartWidthRef.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    };



    useEffect(() => {
        const handleClickOutside = (event) => {
            if (templateMenuRef.current && !templateMenuRef.current.contains(event.target)) {
                setShowTemplateMenu(false);
            }
            // Close overflow menu when clicking outside
            if (openOverflowMenu && !event.target.closest('.overflow-menu')) {
                setOpenOverflowMenu(null);
            }
            // Close plus overlay when clicking outside
            if (showPlusOverlay && !event.target.closest('.plus-overlay-container')) {
                setShowPlusOverlay(false);
                setShowGoogleDriveOptions(false);
            }
            // Clear AI tag suggestions when clicking outside tag input container
            if (aiTagSuggestions.length > 0 && tagInputContainerRef.current && !tagInputContainerRef.current.contains(event.target)) {
                setAiTagSuggestions([]);
            }
            // Hide AI transformation toolbar when clicking outside
            if (aiTransformToolbar.visible && !event.target.closest('[style*="z-index: 10001"]')) {
                setAiTransformToolbar(prev => ({ ...prev, visible: false }));
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [openOverflowMenu, showPlusOverlay, aiTagSuggestions, aiTransformToolbar.visible]);



    if (!isAuthReady) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100 text-gray-800">
                <div className="text-xl animate-pulse">Loading application...</div>
            </div>
        );
    }

    return (
        <div className={`flex flex-col md:flex-row h-screen ${isDarkMode ? 'bg-gray-900 text-gray-200' : 'bg-gray-100 text-gray-800'} font-inter`}>

            {/* Mobile Header Bar - Visible only on small screens */}
            <div className={`flex md:hidden w-full p-4 items-center justify-between shadow-md z-20
                ${isDarkMode ? 'bg-gray-800 text-gray-200' : 'bg-white text-gray-800'} fixed top-0 left-0`}>
                <button onClick={() => setShowSidebarMobile(!showSidebarMobile)} className={`p-2 rounded-md ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}>
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
                </button>
                <span className="text-lg font-semibold">Notes</span>
                <button onClick={() => setShowLlmMobile(!showLlmMobile)} className={`p-2 rounded-md ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}>
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 4v-4z" /></svg>
                </button>
            </div>

            {/* Sidebar - Fixed for mobile overlay, relative for desktop */}
            <div className={`fixed top-0 left-0 h-screen w-80 md:relative md:w-80
                ${isDarkMode ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'} border-r flex flex-col z-30
                ${showSidebarMobile ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 transition-transform duration-300 ease-in-out`}>
                
                {/* Close button for mobile sidebar */}
                <button onClick={() => setShowSidebarMobile(false)} className={`md:hidden absolute top-4 right-4 p-2 rounded-md ${isDarkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-200'} transition-colors`}>
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>

                {/* Workspace Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
                    <div className="flex items-center min-w-0 flex-1">
                        <div className="w-6 h-6 rounded-sm bg-gradient-to-br from-blue-500 to-purple-600 flex-shrink-0 mr-2 flex items-center justify-center">
                            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                            </svg>
                        </div>
                        <span className={`font-medium text-sm truncate ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                            My Workspace
                        </span>
                    </div>
                    <button
                        onClick={toggleDarkMode}
                        className={`p-1.5 rounded-md flex-shrink-0 transition-colors duration-200
                            ${isDarkMode ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-200 text-gray-600'}
                        `}
                        title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                    >
                        {isDarkMode ? (
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                            </svg>
                        ) : (
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                            </svg>
                        )}
                    </button>
                </div>

                {/* Navigation Section */}
                <div className="px-3 py-3 space-y-1">
                    {/* Search */}
                    <div className={`flex items-center px-2 py-1.5 rounded-md transition-colors cursor-pointer
                        ${isDarkMode ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-gray-200 text-gray-700'}
                    `}>
                        <svg className="w-4 h-4 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                        </svg>
                        <input
                            type="text"
                            placeholder="Search"
                            className={`flex-1 bg-transparent text-sm outline-none placeholder-current
                                ${isDarkMode ? 'text-gray-300 placeholder-gray-500' : 'text-gray-700 placeholder-gray-500'}
                            `}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {/* Private Section */}
                <div className="px-3">
                    <div className={`flex items-center justify-between px-2 py-1 mb-2
                        ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}
                    `}>
                        <span className="text-xs font-medium uppercase tracking-wider">Private</span>
                        <button
                            onClick={() => setShowTemplateMenu(prev => !prev)}
                            className={`p-1 rounded-md transition-colors
                                ${isDarkMode ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-200 text-gray-500'}
                            `}
                            title="Add page"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
                            </svg>
                        </button>
                    </div>

                    {/* Template dropdown */}
                    {showTemplateMenu && (
                        <div className={`absolute left-4 right-4 z-50 rounded-md shadow-lg border mt-1
                            ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}
                        `} ref={templateMenuRef}>
                            <div className="p-2">
                                {templates.map(template => (
                                    <button
                                        key={template.name}
                                        onClick={() => handleAddDocument(template)}
                                        className={`flex items-center w-full px-2 py-1.5 rounded-md text-sm text-left transition-colors
                                            ${isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'}
                                        `}
                                    >
                                        <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                                        </svg>
                                        {template.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Documents List */}
                <div className="flex-grow overflow-y-auto px-1">
                    {/* Filter by search but show hierarchical tree */}
                    {filteredDocuments.length === 0 && documents.length === 0 && (
                        <div className={`text-sm px-2 py-3 ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                            No pages inside
                        </div>
                    )}
                    {filteredDocuments.length === 0 && documents.length > 0 && (
                        <div className={`text-sm px-2 py-3 ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                            No matching pages
                        </div>
                    )}
                    
                    {/* Show tree structure (filtered if search is active) */}
                    <div className="space-y-0.5">
                        {(() => {
                            // If there's a search, build tree from filtered results only
                            const treeToRender = searchTerm.trim() ? buildDocumentTree(filteredDocuments) : documentTree;
                            
                            return treeToRender.map(node => (
                                <TreeNode 
                                    key={node.id} 
                                    node={node} 
                                    level={0} 
                                    onAddChild={(parentId) => handleAddDocument({ name: 'Blank Page', title: '', content: '' }, parentId)}
                                />
                            ));
                        })()}
                    </div>
                </div>

                {/* File Management Sections */}
                {/* Files Section */}
                <div className="px-3 border-t border-gray-200 dark:border-gray-800 pt-3">
                    <div className={`flex items-center justify-between px-2 py-1 mb-2
                        ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}
                    `}>
                        <button
                            onClick={() => setShowFilesSection(prev => !prev)}
                            className="flex items-center text-xs font-medium uppercase tracking-wider"
                        >
                            <svg className={`w-3 h-3 mr-1 transition-transform ${showFilesSection ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/>
                            </svg>
                            Files ({uploadedFiles.length})
                        </button>
                        <button
                            onClick={triggerFileUpload}
                            className={`p-1 rounded-md transition-colors
                                ${isDarkMode ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-200 text-gray-500'}
                            `}
                            title="Upload file"
                            disabled={isUploadingFile}
                        >
                            {isUploadingFile ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-t border-current"></div>
                            ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
                                </svg>
                            )}
                        </button>
                    </div>

                    {/* Upload Progress */}
                    {(fileUploadProgress || fileContentProcessingProgress) && (
                        <div className={`px-2 py-1 mb-2 text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            {fileUploadProgress || fileContentProcessingProgress}
                        </div>
                    )}

                    {/* Files List */}
                    {showFilesSection && (
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                            {uploadedFiles.length === 0 ? (
                                <div className={`text-xs px-2 py-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                                    No files uploaded
                                </div>
                            ) : (
                                uploadedFiles.map(file => (
                                    <div key={file.id} className={`flex items-center px-2 py-1.5 rounded-md transition-colors group
                                        ${isDarkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}
                                    `}>
                                        <span className="text-lg mr-2">{getFileIcon(file.fileType)}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => window.open(file.downloadURL, '_blank')}
                                                    className={`text-sm truncate flex-1 text-left hover:underline
                                                        ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}
                                                    `}
                                                    title={file.fileName}
                                                >
                                                    {file.fileName}
                                                </button>
                                                {/* Phase 2: AI Analysis Indicator */}
                                                {file.contentExtracted && (
                                                    <span 
                                                        className="text-green-500 text-xs" 
                                                        title="Content analyzed for AI assistant"
                                                    >
                                                        🧠
                                                    </span>
                                                )}
                                            </div>
                                            <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                                                {formatFileSize(file.fileSize)}
                                                {file.processingStatus === 'pending' && (
                                                    <span className="ml-2 text-yellow-600">• Processing...</span>
                                                )}
                                                {file.processingStatus === 'completed' && file.contentExtracted && (
                                                    <span className="ml-2 text-green-600">• AI Ready</span>
                                                )}
                                                {file.processingStatus === 'failed' && (
                                                    <span className="ml-2 text-red-600">• Processing Failed</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            {/* Phase 2: Re-analyze button for files without content */}
                                            {!file.contentExtracted && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleReprocessFile(file);
                                                    }}
                                                    className={`opacity-0 group-hover:opacity-100 p-1 rounded transition-all
                                                        ${isDarkMode ? 'hover:bg-blue-700 text-blue-400' : 'hover:bg-blue-200 text-blue-600'}
                                                    `}
                                                    title="Analyze for AI assistant"
                                                    disabled={isProcessingFileContent}
                                                >
                                                    🧠
                                                </button>
                                            )}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteFile(file.id);
                                                }}
                                                className={`opacity-0 group-hover:opacity-100 p-1 rounded transition-all
                                                    ${isDarkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500'}
                                                `}
                                                title="Delete file"
                                            >
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>

                {/* Google Links Section */}
                <div className="px-3 border-t border-gray-200 dark:border-gray-800 pt-3">
                    <div className={`flex items-center justify-between px-2 py-1 mb-2
                        ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}
                    `}>
                        <button
                            onClick={() => setShowGoogleLinksSection(prev => !prev)}
                            className="flex items-center text-xs font-medium uppercase tracking-wider"
                        >
                            <svg className={`w-3 h-3 mr-1 transition-transform ${showGoogleLinksSection ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/>
                            </svg>
                            Google Links ({googleLinks.length})
                        </button>
                        <button
                            onClick={() => setShowAddGoogleLinkModal(true)}
                            className={`p-1 rounded-md transition-colors
                                ${isDarkMode ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-200 text-gray-500'}
                            `}
                            title="Add Google link"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
                            </svg>
                        </button>
                    </div>

                    {/* Google Links List */}
                    {showGoogleLinksSection && (
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                            {googleLinks.length === 0 ? (
                                <div className={`text-xs px-2 py-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                                    No Google links added
                                </div>
                            ) : (
                                <>
                                    <div className={`text-xs px-2 py-1 mb-2 ${isDarkMode ? 'text-blue-400 bg-blue-900/20' : 'text-blue-600 bg-blue-50'} rounded`}>
                                        💡 Tip: Public Google Docs content auto-extracts for AI. Private docs need copy/paste.
                                    </div>
                                    {googleLinks.map(link => (
                                    <div key={link.id} className={`flex items-center px-2 py-1.5 rounded-md transition-colors group
                                        ${isDarkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}
                                    `}>
                                        <span className="text-lg mr-2">{getLinkIcon(link.linkType)}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => window.open(link.url, '_blank')}
                                                    className={`text-sm truncate flex-1 text-left hover:underline
                                                        ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}
                                                    `}
                                                    title={link.title}
                                                >
                                                    {link.title}
                                                </button>
                                                {/* Content extraction indicator */}
                                                {link.contentExtracted && (
                                                    <span 
                                                        className="text-green-500 text-xs" 
                                                        title="Content extracted for AI assistant"
                                                    >
                                                        🧠
                                                    </span>
                                                )}
                                            </div>
                                            <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                                                {link.linkType === 'google_doc' ? 'Google Doc' : 'Google Sheet'}
                                                {link.contentExtracted && (
                                                    <span className="ml-2 text-green-600">• AI Ready</span>
                                                )}
                                            </div>
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteGoogleLink(link.id);
                                            }}
                                            className={`opacity-0 group-hover:opacity-100 p-1 rounded transition-all
                                                ${isDarkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500'}
                                            `}
                                            title="Delete link"
                                        >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                            </svg>
                                        </button>
                                    </div>
                                    ))}
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Document Editor - Takes full width on mobile, responsive for desktop */}
            <div 
                className={`p-8 flex flex-col overflow-hidden w-full
                    ${isDarkMode ? 'bg-gray-900 text-gray-200' : 'bg-white text-gray-800'}
                    ${showSidebarMobile || showLlmMobile ? 'hidden' : 'flex'} md:flex`}
                style={{ width: window.innerWidth >= 768 ? `${100 - rightPanelWidth}%` : '100%' }}
            > {/* Hide on mobile if a panel is open, but always show on md+ */}
                <div className="md:pt-0 pt-16 w-full max-w-4xl mx-auto flex-grow flex flex-col"> {/* Adjust padding for fixed header */}
                    {/* Breadcrumb Navigation */}
                    {currentDocumentId && (() => {
                        const breadcrumbPath = getBreadcrumbPath(currentDocumentId);
                        return breadcrumbPath.length > 1 && (
                            <div className={`flex items-center text-sm mb-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                {breadcrumbPath.map((doc, index) => (
                                    <div key={doc.id} className="flex items-center">
                                        {index > 0 && (
                                            <svg className="w-4 h-4 mx-2" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                            </svg>
                                        )}
                                        <button
                                            onClick={() => index < breadcrumbPath.length - 1 ? handleDocumentSelect(doc.id) : null}
                                            className={`hover:underline ${index === breadcrumbPath.length - 1 ? 'font-medium' : 'cursor-pointer'}`}
                                        >
                                            {doc.title || 'New page'}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        );
                    })()}
                    
                    {/* Cover Image */}
                    {currentDocumentId && currentDocumentCoverImage && (
                        <div className="group relative mb-6 rounded-lg overflow-hidden">
                            <img 
                                src={currentDocumentCoverImage} 
                                alt="Document cover"
                                className="w-full h-48 object-cover"
                            />
                            {/* Cover Image Controls */}
                            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-200 rounded-lg">
                                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex gap-2">
                                    <button
                                        onClick={() => {
                                            const fileInput = document.createElement('input');
                                            fileInput.type = 'file';
                                            fileInput.accept = 'image/*';
                                            fileInput.onchange = (e) => {
                                                if (e.target.files[0]) {
                                                    uploadCoverImage(e.target.files[0]);
                                                }
                                            };
                                            fileInput.click();
                                        }}
                                        className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors
                                            ${isDarkMode ? 'bg-gray-800 hover:bg-gray-700 text-white' : 'bg-white hover:bg-gray-100 text-gray-700'}
                                        `}
                                        disabled={isUploadingCover}
                                    >
                                        {isUploadingCover ? (uploadProgress || 'Uploading...') : 'Change cover'}
                                    </button>
                                    <button
                                        onClick={removeCoverImage}
                                        className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors
                                            ${isDarkMode ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-red-500 hover:bg-red-600 text-white'}
                                        `}
                                    >
                                        Remove
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Title with Icon and Toolbar */}
                    {currentDocumentId && (
                        <div className="group relative mb-6">
                            {/* Notion-like Hover Toolbar - Positioned to the right of title */}
                            <div className={`absolute top-2 right-0 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-200 z-50 
                                px-3 py-2 rounded-lg shadow-lg border
                                ${isDarkMode ? 'bg-gray-800 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-700'}
                            `}>
                                <button
                                    onClick={() => setShowIconPicker(!showIconPicker)}
                                    className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition-colors font-medium
                                        ${isDarkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600'}
                                    `}
                                    title="Add or change document icon"
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <circle cx="12" cy="12" r="10"></circle>
                                        <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                                        <line x1="9" y1="9" x2="9.01" y2="9"></line>
                                        <line x1="15" y1="9" x2="15.01" y2="9"></line>
                                    </svg>
                                    Icon
                                </button>
                                
                                <button 
                                    onClick={() => {
                                        const fileInput = document.createElement('input');
                                        fileInput.type = 'file';
                                        fileInput.accept = 'image/*';
                                        fileInput.onchange = (e) => {
                                            if (e.target.files[0]) {
                                                uploadCoverImage(e.target.files[0]);
                                            }
                                        };
                                        fileInput.click();
                                    }}
                                    disabled={isUploadingCover}
                                    className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition-colors font-medium
                                        ${isDarkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600'}
                                        ${isUploadingCover ? 'opacity-50 cursor-not-allowed' : ''}
                                    `}
                                    title="Add or change cover image"
                                >
                                    {isUploadingCover ? (
                                        <div className="animate-spin rounded-full h-3.5 w-3.5 border-t border-current"></div>
                                    ) : (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
                                            <polyline points="16,6 12,2 8,6"></polyline>
                                            <line x1="12" y1="2" x2="12" y2="15"></line>
                                        </svg>
                                    )}
                                    {isUploadingCover ? (uploadProgress || 'Uploading...') : 'Cover'}
                                </button>
                            </div>
                            
                            {/* Document Icon and Title */}
                            <div className="flex items-start mb-6 pr-32">
                                {currentDocumentIcon && (
                                    <button
                                        onClick={() => setShowIconPicker(!showIconPicker)}
                                        className={`text-4xl hover:bg-gray-100 rounded-lg p-1 mr-3 transition-colors duration-200 cursor-pointer flex-shrink-0
                                            ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}
                                        `}
                                        title="Change icon"
                                    >
                                        {currentDocumentIcon}
                                    </button>
                                )}
                                
                                <textarea
                                    ref={(el) => {
                                        if (el) {
                                            // Auto-resize on mount and content change
                                            const resize = () => {
                                                el.style.height = 'auto';
                                                el.style.height = el.scrollHeight + 'px';
                                            };
                                            // Resize immediately
                                            setTimeout(resize, 0);
                                        }
                                    }}
                                    className={`flex-1 min-w-0 text-4xl font-extrabold bg-transparent border-none focus:outline-none py-2 resize-none overflow-hidden
                                        ${isDarkMode ? 'text-gray-200 placeholder-gray-500' : 'text-gray-900 placeholder-gray-300'}`}
                                    value={currentDocumentTitle}
                                    onChange={(e) => {
                                        setCurrentDocumentTitle(e.target.value);
                                        // Auto-resize on change
                                        setTimeout(() => {
                                            e.target.style.height = 'auto';
                                            e.target.style.height = e.target.scrollHeight + 'px';
                                        }, 0);
                                    }}
                                    placeholder="New page"
                                    rows="1"
                                    style={{
                                        minHeight: '3.5rem',
                                        lineHeight: '1.1',
                                        height: 'auto'
                                    }}
                                />
                            </div>
                            
                            {/* AI Suggested Titles */}
                            {suggestedTitles.length > 0 && (
                                <div className="mt-3">
                                    <div className={`text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                        💡 AI Title & Icon Suggestions:
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {suggestedTitles.map((suggestion, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => applySuggestedTitle(suggestion)}
                                                className={`text-left p-3 rounded-lg border transition-all duration-200 hover:scale-[1.02]
                                                    ${isDarkMode 
                                                        ? 'bg-blue-900/20 border-blue-700/30 text-blue-300 hover:bg-blue-900/30 hover:border-blue-600' 
                                                        : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 hover:border-blue-300'
                                                    }
                                                `}
                                            >
                                                <div className="flex items-center gap-2">
                                                    {suggestion.emoji && (
                                                        <span className="text-lg">{suggestion.emoji}</span>
                                                    )}
                                                    <div className="font-medium text-sm flex-1">{suggestion.title}</div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                    <button
                                        onClick={() => setSuggestedTitles([])}
                                        className={`mt-2 text-xs ${isDarkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-600'} transition-colors`}
                                    >
                                        ✕ Dismiss suggestions
                                    </button>
                                </div>
                            )}
                            
                            {/* Icon Picker */}
                            {showIconPicker && (
                                <div className={`absolute top-16 left-0 mt-2 rounded-lg shadow-xl border z-50 overflow-hidden
                                    ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'}
                                `} style={{ width: '320px', maxHeight: '400px' }}>
                                    {/* Header */}
                                    <div className={`flex items-center justify-between p-3 border-b ${isDarkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                                        <h3 className={`text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>Icon</h3>
                                        <button 
                                            onClick={() => setShowIconPicker(false)}
                                            className={`p-1 rounded-md hover:bg-opacity-80 transition-colors ${isDarkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                                <line x1="6" y1="6" x2="18" y2="18"></line>
                                            </svg>
                                        </button>
                                    </div>
                                    
                                    {/* Search */}
                                    <div className={`p-3 border-b ${isDarkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                                        <div className="relative">
                                            <svg className={`absolute left-2.5 top-1/2 transform -translate-y-1/2 w-4 h-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                            </svg>
                                            <input
                                                type="text"
                                                placeholder="Filter..."
                                                value={iconSearchTerm}
                                                onChange={(e) => setIconSearchTerm(e.target.value)}
                                                className={`w-full pl-8 pr-3 py-2 text-sm rounded-md border transition-colors
                                                    ${isDarkMode 
                                                        ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-400 focus:border-blue-500' 
                                                        : 'bg-gray-50 border-gray-300 text-gray-800 placeholder-gray-500 focus:border-blue-500'
                                                    } focus:outline-none focus:ring-1 focus:ring-blue-500`}
                                            />
                                        </div>
                                    </div>
                                    
                                    {/* Categories */}
                                    <div className={`flex overflow-x-auto p-2 border-b ${isDarkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                                        {Object.keys(emojiCategories).map(category => (
                                            <button
                                                key={category}
                                                onClick={() => setActiveIconCategory(category)}
                                                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap mr-1 transition-colors
                                                    ${activeIconCategory === category 
                                                        ? (isDarkMode ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white')
                                                        : (isDarkMode ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100')
                                                    }`}
                                            >
                                                {category}
                                            </button>
                                        ))}
                                    </div>
                                    
                                    {/* Icon Grid */}
                                    <div className="p-3 max-h-64 overflow-y-auto">
                                        <div className="grid grid-cols-8 gap-1">
                                            {getFilteredEmojis().map((emoji, index) => (
                                                <button 
                                                    key={index}
                                                    onClick={() => updateDocumentIcon(emoji)}
                                                    className={`text-lg p-2 rounded-md transition-all duration-150 hover:scale-110
                                                        ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}
                                                        ${currentDocumentIcon === emoji ? (isDarkMode ? 'bg-gray-700 ring-2 ring-blue-500' : 'bg-gray-100 ring-2 ring-blue-500') : ''}
                                                    `}
                                                    title={`${emoji} - ${emojiData[emoji] ? emojiData[emoji].join(', ') : ''}`}
                                                >
                                                    {emoji}
                                                </button>
                                            ))}
                                        </div>
                                        {getFilteredEmojis().length === 0 && iconSearchTerm && (
                                            <div className={`text-center py-8 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                                No emojis found for "{iconSearchTerm}"
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* Footer */}
                                    <div className={`p-3 border-t ${isDarkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                                        <button 
                                            onClick={() => updateDocumentIcon('')}
                                            className={`w-full py-2 px-3 text-sm font-medium rounded-md transition-colors
                                                ${isDarkMode 
                                                    ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' 
                                                    : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                                                }`}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {currentDocumentId && (
                        <>
                            {/* Tags input/display - Phase 5: Simplified with plus button AI actions */}
                            <div ref={tagInputContainerRef} className="flex flex-wrap items-center gap-2 mb-4">
                                {currentDocumentTags.map((tag, idx) => (
                                    <span key={idx} className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                                        ${isDarkMode ? 'bg-gray-700 text-gray-300' : 'bg-blue-100 text-blue-800'}
                                    `}>
                                        {tag}
                                        <button
                                            onClick={() => handleRemoveTag(tag)}
                                            className={`ml-1 -mr-0.5 h-3 w-3 rounded-full flex items-center justify-center
                                                ${isDarkMode ? 'text-gray-400 hover:text-gray-200' : 'text-blue-500 hover:text-blue-700'}
                                            `}
                                        >
                                            <svg className="h-2 w-2" stroke="currentColor" fill="none" viewBox="0 0 8 8">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M1 1l6 6m0-6L1 7" />
                                            </svg>
                                        </button>
                                    </span>
                                ))}
                                <input
                                    type="text"
                                    className={`flex-grow min-w-[100px] max-w-xs p-1.5 rounded-md text-sm
                                        ${isDarkMode ? 'bg-gray-700 text-gray-200 placeholder-gray-400 border-gray-600' : 'bg-gray-50 text-gray-800 placeholder-gray-500 border-gray-300'}
                                        border focus:outline-none focus:ring-1 focus:ring-blue-400`}
                                    placeholder="Add tag (e.g., 'work, idea') or use + button for AI suggestions"
                                    onKeyPress={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault(); // Prevent new line in editor
                                            const tagsToAdd = e.target.value.split(',').map(t => t.trim()).filter(Boolean);
                                            tagsToAdd.forEach(tag => handleAddTag(tag));
                                            e.target.value = '';
                                        }
                                    }}
                                />

                                {/* AI Tag Suggestions Display */}
                                {aiTagSuggestions.length > 0 && (
                                    <div className={`w-full flex flex-wrap gap-2 mt-2 p-2 rounded-md shadow-inner
                                        ${isDarkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-800'}`}>
                                        <span className="text-xs font-semibold uppercase mr-2 opacity-75">AI Suggestions:</span>
                                        {aiTagSuggestions.map((tag, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => { handleAddTag(tag); setAiTagSuggestions(prev => prev.filter(t => t !== tag)); }}
                                                className={`px-2 py-0.5 rounded-full text-xs font-medium
                                                    ${isDarkMode ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-indigo-100 hover:bg-indigo-200 text-indigo-800'}
                                                    transition-colors duration-200`}
                                            >
                                                + {tag}
                                            </button>
                                        ))}
                                        <button
                                            onClick={() => setAiTagSuggestions([])}
                                            className={`ml-auto text-xs px-2 py-0.5 rounded-md
                                                ${isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
                                        >
                                            Dismiss
                                        </button>
                                    </div>
                                )}

                                {/* Legacy AI Suggested Tags - Keep for backward compatibility */}
                                {suggestedTags.length > 0 && (
                                    <div className="w-full mt-2">
                                        <div className={`text-xs font-medium mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                            AI Suggestions:
                                        </div>
                                        <div className="flex flex-wrap gap-1">
                                            {suggestedTags.map((tag, idx) => (
                                                <button
                                                    key={idx}
                                                    onClick={() => addSuggestedTag(tag)}
                                                    className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium transition-colors duration-200
                                                        ${isDarkMode ? 'bg-purple-900 text-purple-300 hover:bg-purple-800 border border-purple-700' : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'}
                                                    `}
                                                >
                                                    <svg className="h-2.5 w-2.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                                    </svg>
                                                    {tag}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                    {/* Editor.js Integration with Fallback */}
                    <div
                        ref={editorElementRef}
                        className={`flex-grow w-full text-lg leading-relaxed mb-4 relative
                            ${isDarkMode ? 'editor-dark' : 'editor-light'}`}
                    ></div>



                    {/* Unified AI Toolbar for Selected Text */}
                    {aiTransformToolbar.visible && (
                        <div 
                            className={`fixed p-1 rounded shadow-lg flex gap-1 transition-all duration-200
                                ${isDarkMode 
                                    ? 'bg-gray-700 text-gray-100 border border-gray-600' 
                                    : 'bg-gray-800 text-white border border-gray-700'
                                }`}
                            style={{
                                left: aiTransformToolbar.x,
                                top: aiTransformToolbar.y,
                                zIndex: 10001,
                                fontSize: '11px',
                                fontWeight: '500',
                                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
                            }}
                        >
                            {/* Ask AI Button */}
                            <button 
                                onClick={() => {
                                    const question = `Tell me about "${aiTransformToolbar.selectedText}"`;
                                    setAiTransformToolbar(prev => ({ ...prev, visible: false }));
                                    try {
                                        askLlm(question, aiTransformToolbar.selectedText);
                                    } catch (error) {
                                        console.error("Error calling askLlm:", error);
                                    }
                                }}
                                disabled={aiTransformLoading}
                                className={`px-2 py-1 rounded-sm transition-colors duration-200 font-medium flex items-center gap-1
                                    ${isDarkMode 
                                        ? 'text-gray-100 hover:bg-gray-600 disabled:opacity-50' 
                                        : 'text-white hover:bg-gray-700 disabled:opacity-50'
                                    }`}
                                title="Ask AI about selected text"
                            >
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                </svg>
                                Ask AI
                            </button>
                            
                            {/* Separator */}
                            <div className={`w-px h-6 ${isDarkMode ? 'bg-gray-600' : 'bg-gray-600'}`}></div>
                            
                            {/* Transformation Buttons */}
                            <button 
                                onClick={() => handleAiTransform('summarize')}
                                disabled={aiTransformLoading}
                                className={`px-2 py-1 rounded-sm transition-colors duration-200 font-medium
                                    ${isDarkMode 
                                        ? 'text-gray-100 hover:bg-gray-600 disabled:opacity-50' 
                                        : 'text-white hover:bg-gray-700 disabled:opacity-50'
                                    }`}
                                title="Summarize selected text"
                            >
                                Summarize
                            </button>
                            <button 
                                onClick={() => handleAiTransform('rewrite')}
                                disabled={aiTransformLoading}
                                className={`px-2 py-1 rounded-sm transition-colors duration-200 font-medium
                                    ${isDarkMode 
                                        ? 'text-gray-100 hover:bg-gray-600 disabled:opacity-50' 
                                        : 'text-white hover:bg-gray-700 disabled:opacity-50'
                                    }`}
                                title="Rewrite selected text for clarity"
                            >
                                Rewrite
                            </button>
                            <button 
                                onClick={() => handleAiTransform('expand')}
                                disabled={aiTransformLoading}
                                className={`px-2 py-1 rounded-sm transition-colors duration-200 font-medium
                                    ${isDarkMode 
                                        ? 'text-gray-100 hover:bg-gray-600 disabled:opacity-50' 
                                        : 'text-white hover:bg-gray-700 disabled:opacity-50'
                                    }`}
                                title="Expand selected text with more details"
                            >
                                Expand
                            </button>
                            
                            {/* Arrow pointing down to selection */}
                            <div 
                                className="absolute pointer-events-none"
                                style={{
                                    top: '100%',
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    width: 0,
                                    height: 0,
                                    borderLeft: '4px solid transparent',
                                    borderRight: '4px solid transparent',
                                    borderTop: `4px solid ${isDarkMode ? '#374151' : '#1f2937'}`
                                }}
                            />
                        </div>
                    )}

                    {/* Feature 2: Internal Link Autocomplete */}
                    {linkAutocomplete.visible && linkAutocomplete.suggestions.length > 0 && (
                        <div 
                            className={`fixed rounded-md shadow-lg border max-w-xs z-10000
                                ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'}`}
                            style={{
                                left: linkAutocomplete.x,
                                top: linkAutocomplete.y,
                                fontSize: '14px'
                            }}
                        >
                            <div className={`px-2 py-1 text-xs font-medium border-b ${isDarkMode ? 'text-gray-400 border-gray-600' : 'text-gray-500 border-gray-200'}`}>
                                Link to page
                            </div>
                            {linkAutocomplete.suggestions.map((doc, index) => (
                                <button
                                    key={doc.id}
                                    onClick={() => insertInternalLink(doc)}
                                    className={`w-full text-left px-3 py-2 text-sm transition-colors duration-150 flex items-center gap-2
                                        ${index === linkAutocomplete.selectedIndex 
                                            ? (isDarkMode ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white')
                                            : (isDarkMode ? 'text-gray-200 hover:bg-gray-700' : 'text-gray-800 hover:bg-gray-100')
                                        }`}
                                >
                                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                                    </svg>
                                    <span className="truncate">{doc.title}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="mt-4 text-xs text-right">
                        <span className={isDarkMode ? 'text-gray-500' : 'text-gray-500'}>{saveStatus}</span>
                    </div>
                </div>
            </div>

            {/* Resize Handle - Only visible on desktop */}
            <div 
                className={`hidden md:block cursor-col-resize transition-all duration-200 z-10 relative
                    ${isDarkMode ? 'hover:bg-blue-400' : 'hover:bg-blue-500'}`}
                style={{ width: '2px' }}
                onMouseDown={handleMouseDown}
            >
                <div 
                    className={`absolute inset-y-0 -left-1 -right-1 
                        ${isDarkMode ? 'bg-gray-600' : 'bg-gray-300'}`} 
                    style={{ width: '1px', left: '50%', transform: 'translateX(-50%)' }}
                ></div>
                {/* Invisible wider hit area for easier grabbing */}
                <div className="absolute inset-y-0 -left-2 -right-2"></div>
            </div>

            {/* LLM Chat - Fixed for mobile overlay, relative for desktop */}
            <div 
                className={`fixed top-0 right-0 h-screen w-3/4 sm:w-1/2 md:relative border-l p-4 flex flex-col z-30
                    ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}
                    ${showLlmMobile ? 'translate-x-0' : 'translate-x-full'} md:translate-x-0 transition-transform duration-300 ease-in-out`}
                style={{ width: window.innerWidth >= 768 ? `${rightPanelWidth}%` : undefined }}
            >
                {/* Close button for mobile LLM */}
                <button onClick={() => setShowLlmMobile(false)} className={`md:hidden absolute top-4 left-4 p-2 rounded-full ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}>
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
                <div className="flex items-center justify-between mb-6">
                    <div className={`text-lg font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>AI Assistant</div>
                    {chatHistory.length > 0 && (
                        <button
                            onClick={() => {
                                setChatHistory([]);
                                setLlmResponse('');
                                setExternalSearchSuggestions([]);
                            }}
                            className={`px-2 py-1 text-xs rounded-md transition-colors duration-200
                                ${isDarkMode ? 'bg-gray-600 text-gray-300 hover:bg-gray-500' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}
                            `}
                            title="Clear chat history"
                        >
                            Clear Chat
                        </button>
                    )}
                </div>
                <div ref={llmResponseRef} className={`flex-grow overflow-y-auto p-3 rounded-md mb-4 custom-scrollbar text-sm leading-relaxed
                    ${isDarkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-800'}`}>
                    {chatHistory.length === 0 ? (
                        <div className={`text-center py-8 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            Ask a question about your documents here. For example: 'Summarize all my notes.'
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {chatHistory.map((message, index) => (
                                <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[80%] rounded-lg px-3 py-2 ${
                                        message.role === 'user' 
                                            ? (isDarkMode ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white')
                                            : (isDarkMode ? 'bg-gray-600 text-gray-100' : 'bg-gray-200 text-gray-800')
                                    }`}>
                                        <div className={`text-xs mb-1 opacity-75 ${
                                            message.role === 'user' ? 'text-right' : 'text-left'
                                        }`}>
                                            {message.role === 'user' ? 'You' : 'AI Assistant'}
                                        </div>
                                        <div className="whitespace-pre-wrap">{message.parts[0].text}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    {(llmLoading || aiTransformLoading) && (
                        <div className="flex items-center justify-center mt-4">
                            <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-blue-500"></div>
                            <span className={`ml-2 text-sm ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`}>
                                {aiTransformLoadingMessage || llmLoadingMessage || 'Thinking...'}
                            </span>
                        </div>
                    )}

                    {/* Phase 5: AI Title & Icon Suggestions Display */}
                    {aiTitleIconSuggestions.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-gray-300 dark:border-gray-600">
                            <h4 className="font-semibold text-sm mb-2">AI Title & Icon Suggestions:</h4>
                            <div className="grid grid-cols-2 gap-2">
                                {aiTitleIconSuggestions.map((suggestion, index) => (
                                    <button
                                        key={index}
                                        onClick={() => handleApplyAiTitleIcon(suggestion.title, suggestion.icon)}
                                        className={`flex items-center p-3 rounded-md text-left
                                            ${isDarkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-blue-50 hover:bg-blue-100 text-blue-900'}
                                            transition-colors duration-200`}
                                    >
                                        {suggestion.icon && (
                                            suggestion.icon.startsWith('http') ?
                                                <img src={suggestion.icon} alt="icon" className="w-5 h-5 mr-2 object-cover rounded-sm" /> :
                                                <span className="mr-2 text-xl leading-none">{suggestion.icon}</span>
                                        )}
                                        <span className="font-medium truncate">{suggestion.title}</span>
                                    </button>
                                ))}
                            </div>
                            {/* Dismiss button for suggestions */}
                            <button
                                onClick={() => setAiTitleIconSuggestions([])}
                                className={`text-xs mt-3 px-2 py-1 rounded-md
                                    ${isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
                            >
                                Dismiss suggestions
                            </button>
                        </div>
                    )}
                </div>



                {/* External Search Suggestions */}
                {externalSearchSuggestions.length > 0 && (
                    <div className={`mb-4 p-3 rounded-md border relative ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-blue-50 border-blue-200'}`}>
                        {/* Close Button */}
                        <button
                            onClick={() => setExternalSearchSuggestions([])}
                            className={`absolute top-2 right-2 p-1 rounded-md transition-colors duration-200
                                ${isDarkMode 
                                    ? 'hover:bg-gray-600 text-gray-400 hover:text-gray-200' 
                                    : 'hover:bg-blue-200 text-blue-600 hover:text-blue-800'
                                }
                            `}
                            title="Close search suggestions"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                        
                        <h4 className={`text-sm font-medium mb-2 pr-6 ${isDarkMode ? 'text-gray-200' : 'text-blue-800'}`}>
                            🔍 Explore More Online
                        </h4>
                        <div className="flex flex-wrap gap-2">
                            {externalSearchSuggestions.map((term, index) => (
                                <a
                                    key={index}
                                    href={`https://www.google.com/search?q=${encodeURIComponent(term)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`px-3 py-1.5 text-xs rounded-full transition-colors duration-200 hover:scale-105 transform
                                        ${isDarkMode 
                                            ? 'bg-gray-600 text-gray-200 hover:bg-gray-500' 
                                            : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                        }
                                    `}
                                    title={`Search Google for "${term}"`}
                                >
                                    {term}
                                </a>
                            ))}
                        </div>
                        <p className={`text-xs mt-2 opacity-75 ${isDarkMode ? 'text-gray-400' : 'text-blue-600'}`}>
                            Click any term to search for more information online
                        </p>
                    </div>
                )}

                {/* Chat Input with Plus Button */}
                <div className="relative mb-3 plus-overlay-container">
                    {/* Plus Button */}
                    <button
                        onClick={handlePlusButtonClick}
                        className={`absolute left-2 top-1/2 transform -translate-y-1/2 z-10 w-6 h-6 rounded-full flex items-center justify-center transition-colors duration-200
                            ${isDarkMode ? 'bg-gray-600 hover:bg-gray-500 text-gray-300' : 'bg-gray-200 hover:bg-gray-300 text-gray-600'}
                        `}
                        title="Add content, files, or use AI actions"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
                        </svg>
                    </button>

                    {/* Input Field */}
                    <input
                        type="text"
                        className={`w-full pl-10 pr-3 py-2.5 rounded-md border focus:outline-none focus:ring-1 focus:ring-blue-400 text-sm placeholder-gray-400
                            ${isDarkMode ? 'bg-gray-700 text-gray-200 border-gray-600' : 'bg-white text-gray-800 border-gray-300'}`}
                        placeholder="Ask AI about your documents or request new content..."
                        value={llmQuestion}
                        onChange={(e) => setLlmQuestion(e.target.value)}
                        onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                                askLlm();
                            }
                        }}
                        disabled={llmLoading || documents.length === 0}
                    />

                    {/* Plus Button Overlay */}
                    {showPlusOverlay && (
                        <div className={`absolute left-0 bottom-full mb-2 w-64 rounded-lg shadow-lg border z-50
                            ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'}
                        `}>
                            <div className="p-3">
                                <h3 className={`text-sm font-medium mb-3 ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                                    Add Content & AI Actions
                                </h3>
                                
                                {/* AI Title & Icon Suggestions */}
                                {currentDocumentId && (
                                    <button
                                        onClick={() => {
                                            handleTriggerAiTitleIconSuggestions();
                                            setShowPlusOverlay(false);
                                        }}
                                        className={`flex items-center w-full p-2 rounded-md text-left transition-colors duration-200 mb-2
                                            ${isDarkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-700'}
                                        `}
                                    >
                                        <div className={`w-8 h-8 rounded-md flex items-center justify-center mr-3
                                            ${isDarkMode ? 'bg-purple-600' : 'bg-purple-100'}
                                        `}>
                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                                            </svg>
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium">Suggest Title & Icon</div>
                                            <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                                AI-powered title and icon suggestions
                                            </div>
                                        </div>
                                    </button>
                                )}

                                {/* AI Tag Suggestions */}
                                {currentDocumentId && (
                                    <button
                                        onClick={() => {
                                            handleTriggerAiTagSuggestions();
                                            setShowPlusOverlay(false);
                                        }}
                                        className={`flex items-center w-full p-2 rounded-md text-left transition-colors duration-200 mb-2
                                            ${isDarkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-700'}
                                        `}
                                    >
                                        <div className={`w-8 h-8 rounded-md flex items-center justify-center mr-3
                                            ${isDarkMode ? 'bg-indigo-600' : 'bg-indigo-100'}
                                        `}>
                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/>
                                            </svg>
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium">Suggest Tags</div>
                                            <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                                AI-powered tag suggestions
                                            </div>
                                        </div>
                                    </button>
                                )}

                                {/* Divider */}
                                {currentDocumentId && (
                                    <div className={`border-t my-2 ${isDarkMode ? 'border-gray-600' : 'border-gray-200'}`}></div>
                                )}

                                {/* File Upload Option */}
                                <button
                                    onClick={handleFileUploadFromOverlay}
                                    className={`flex items-center w-full p-2 rounded-md text-left transition-colors duration-200 mb-2
                                        ${isDarkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-700'}
                                    `}
                                >
                                    <div className={`w-8 h-8 rounded-md flex items-center justify-center mr-3
                                        ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}
                                    `}>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/>
                                        </svg>
                                    </div>
                                    <div>
                                        <div className="text-sm font-medium">Add photos and files</div>
                                        <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                            Upload documents, images, and more
                                        </div>
                                    </div>
                                </button>

                                {/* Google Drive Option */}
                                <button
                                    onClick={handleGoogleDriveClick}
                                    className={`flex items-center w-full p-2 rounded-md text-left transition-colors duration-200
                                        ${isDarkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-700'}
                                    `}
                                >
                                    <div className={`w-8 h-8 rounded-md flex items-center justify-center mr-3
                                        ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}
                                    `}>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                                        </svg>
                                    </div>
                                    <div className="flex items-center justify-between flex-1">
                                        <div>
                                            <div className="text-sm font-medium">Add from apps</div>
                                            <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                                Connect Google Drive
                                            </div>
                                        </div>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/>
                                        </svg>
                                    </div>
                                </button>

                                {/* Google Drive Sub-options */}
                                {showGoogleDriveOptions && (
                                    <div className={`mt-2 ml-4 pl-4 border-l-2 space-y-1
                                        ${isDarkMode ? 'border-gray-600' : 'border-gray-200'}
                                    `}>
                                        <button
                                            onClick={handleGoogleDocsConnect}
                                            className={`flex items-center w-full p-2 rounded-md text-left transition-colors duration-200
                                                ${isDarkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-700'}
                                            `}
                                        >
                                            <div className="w-6 h-6 rounded-md bg-blue-500 flex items-center justify-center mr-3">
                                                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                                                    <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
                                                </svg>
                                            </div>
                                            <div>
                                                <div className="text-sm font-medium">Google Drive</div>
                                                <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                                    Connect Google Docs
                                                </div>
                                            </div>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Feature 2: Document Backlinks */}
                {currentDocumentId && documentBacklinks.length > 0 && (
                    <div className={`mb-4 p-3 rounded-md border ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                        <h4 className={`text-sm font-medium mb-3 flex items-center gap-2 ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
                            </svg>
                            Backlinks ({documentBacklinks.length})
                        </h4>
                        <div className="space-y-1">
                            {documentBacklinks.map((backlink) => (
                                <button
                                    key={backlink.id}
                                    onClick={() => handleDocumentSelect(backlink.id)}
                                    className={`w-full text-left p-2 rounded-md text-sm transition-colors duration-200 flex items-center gap-2
                                        ${isDarkMode ? 'text-gray-300 hover:bg-gray-600' : 'text-gray-700 hover:bg-gray-100'}
                                    `}
                                >
                                    <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                                    </svg>
                                    <span className="truncate">{backlink.title}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <button
                    onClick={() => askLlm()}
                    className={`w-full px-5 py-2 rounded-md text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 transition-colors duration-200 shadow-sm
                        disabled:opacity-50 disabled:cursor-not-allowed`}
                    disabled={llmLoading || documents.length === 0 || llmQuestion.trim().length < 3}
                >
                    Generate Response
                </button>
                {llmQuestion.trim().length > 0 && llmQuestion.trim().length < 3 && (
                    <p className={`text-xs mt-1 text-center ${isDarkMode ? 'text-yellow-300' : 'text-yellow-600'}`}>
                        Please enter at least 3 characters
                    </p>
                )}
                {documents.length === 0 && (
                    <p className={`text-xs mt-2 text-center ${isDarkMode ? 'text-red-300' : 'text-red-500'}`}>Create some pages to use the AI assistant.</p>
                )}
            </div>

            {/* Global CDN and custom styles for scrollbar and Editor.js themes */}
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
                {`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
                .font-inter {
                    font-family: 'Inter', sans-serif;
                }
                .custom-scrollbar::-webkit-scrollbar {
                    width: 8px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: ${isDarkMode ? '#374151' : '#f1f1f1'}; /* dark: gray-700, light: light gray track */
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: ${isDarkMode ? '#6b7280' : '#c0c0c0'}; /* dark: gray-500, light: medium gray thumb */
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: ${isDarkMode ? '#9ca3af' : '#a0a0a0'}; /* dark: gray-400, light: darker gray on hover */
                }

                /* Editor.js Specific Styles (Notion-like) */
                .codex-editor {
                    background-color: ${isDarkMode ? '#1f2937' : 'white'} !important;
                    color: ${isDarkMode ? '#e5e7eb' : '#1f2937'} !important;
                    font-family: 'Inter', sans-serif !important;
                    font-size: 16px !important;
                    line-height: 1.6 !important;
                }
                
                .codex-editor .ce-block__content {
                    background-color: transparent !important;
                    color: ${isDarkMode ? '#e5e7eb' : '#1f2937'} !important;
                    max-width: none !important;
                    margin: 0 !important;
                    padding: 8px 0 !important;
                }
                
                .codex-editor .ce-paragraph {
                    padding: 8px 0 !important;
                    margin: 0 !important;
                    color: ${isDarkMode ? '#e5e7eb' : '#1f2937'} !important;
                    font-size: 16px !important;
                    line-height: 1.6 !important;
                }
                
                .codex-editor .ce-header {
                    color: ${isDarkMode ? '#f9fafb' : '#111827'} !important;
                    font-weight: 600 !important;
                    margin: 16px 0 8px 0 !important;
                    padding: 0 !important;
                }
                
                .codex-editor .ce-toolbar {
                    background-color: ${isDarkMode ? '#374151' : '#f8fafc'} !important;
                    border: 1px solid ${isDarkMode ? '#4b5563' : '#e2e8f0'} !important;
                    border-radius: 8px !important;
                }
                
                .codex-editor .ce-toolbar__plus,
                .codex-editor .ce-toolbar__settings-btn {
                    color: ${isDarkMode ? '#9ca3af' : '#64748b'} !important;
                    background-color: transparent !important;
                }
                
                .codex-editor .ce-toolbar__plus:hover,
                .codex-editor .ce-toolbar__settings-btn:hover {
                    background-color: ${isDarkMode ? '#4b5563' : '#e2e8f0'} !important;
                    color: ${isDarkMode ? '#e5e7eb' : '#1e293b'} !important;
                }
                
                .codex-editor .ce-popover {
                    background-color: ${isDarkMode ? '#374151' : 'white'} !important;
                    border: 1px solid ${isDarkMode ? '#4b5563' : '#e2e8f0'} !important;
                    border-radius: 8px !important;
                    box-shadow: ${isDarkMode ? '0 10px 15px -3px rgba(0, 0, 0, 0.3)' : '0 10px 15px -3px rgba(0, 0, 0, 0.1)'} !important;
                }
                
                .codex-editor .ce-popover__item {
                    color: ${isDarkMode ? '#e5e7eb' : '#1f2937'} !important;
                    padding: 8px 12px !important;
                }
                
                .codex-editor .ce-popover__item:hover {
                    background-color: ${isDarkMode ? '#4b5563' : '#f1f5f9'} !important;
                }
                
                .codex-editor .ce-inline-toolbar {
                    background-color: ${isDarkMode ? '#374151' : 'white'} !important;
                    border: 1px solid ${isDarkMode ? '#4b5563' : '#e2e8f0'} !important;
                    border-radius: 6px !important;
                }
                
                .codex-editor .ce-inline-tool {
                    color: ${isDarkMode ? '#9ca3af' : '#64748b'} !important;
                }
                
                .codex-editor .ce-inline-tool:hover {
                    background-color: ${isDarkMode ? '#4b5563' : '#f1f5f9'} !important;
                    color: ${isDarkMode ? '#e5e7eb' : '#1e293b'} !important;
                }
                
                .codex-editor .ce-block--selected .ce-block__content {
                    background-color: ${isDarkMode ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)'} !important;
                    border-radius: 4px !important;
                }
                
                .codex-editor .cdx-quote {
                    border-left: 4px solid ${isDarkMode ? '#6b7280' : '#d1d5db'} !important;
                    padding-left: 16px !important;
                    margin: 16px 0 !important;
                    font-style: italic !important;
                    color: ${isDarkMode ? '#d1d5db' : '#6b7280'} !important;
                }
                
                .codex-editor .cdx-list {
                    color: ${isDarkMode ? '#e5e7eb' : '#1f2937'} !important;
                }
                
                .codex-editor .cdx-checklist__item-text {
                    color: ${isDarkMode ? '#e5e7eb' : '#1f2937'} !important;
                }
                
                /* Placeholder styling */
                .codex-editor [contenteditable=true]:empty:before {
                    content: attr(data-placeholder);
                    color: ${isDarkMode ? '#6b7280' : '#9ca3af'} !important;
                    font-style: normal !important;
                }
                
                /* Simple Rich Text Editor Styles */
                .simple-rich-editor {
                    ${isDarkMode ? 'filter: invert(1) hue-rotate(180deg);' : ''}
                }
                
                .simple-rich-editor h1 {
                    font-size: 2em;
                    font-weight: bold;
                    margin: 16px 0 8px 0;
                    color: ${isDarkMode ? '#f9fafb' : '#111827'};
                }
                
                .simple-rich-editor h2 {
                    font-size: 1.5em;
                    font-weight: bold;
                    margin: 14px 0 7px 0;
                    color: ${isDarkMode ? '#f9fafb' : '#111827'};
                }
                
                .simple-rich-editor h3 {
                    font-size: 1.25em;
                    font-weight: bold;
                    margin: 12px 0 6px 0;
                    color: ${isDarkMode ? '#f9fafb' : '#111827'};
                }
                
                .simple-rich-editor blockquote {
                    border-left: 4px solid ${isDarkMode ? '#6b7280' : '#d1d5db'};
                    padding-left: 16px;
                    margin: 16px 0;
                    font-style: italic;
                    color: ${isDarkMode ? '#d1d5db' : '#6b7280'};
                }
                
                .simple-rich-editor ul, .simple-rich-editor ol {
                    padding-left: 24px;
                    margin: 8px 0;
                    list-style: revert;
                }
                
                .simple-rich-editor ul {
                    list-style-type: disc;
                }
                
                .simple-rich-editor ol {
                    list-style-type: decimal;
                }
                
                .simple-rich-editor li {
                    margin: 4px 0;
                    display: list-item;
                }
                
                .simple-rich-editor p {
                    margin: 8px 0;
                    color: ${isDarkMode ? '#e5e7eb' : '#1f2937'};
                }
                
                /* Internal Link Styles */
                .internal-link {
                    color: ${isDarkMode ? '#60a5fa' : '#3b82f6'} !important;
                    text-decoration: underline !important;
                    cursor: pointer !important;
                    transition: color 0.2s ease !important;
                }
                
                .internal-link:hover {
                    color: ${isDarkMode ? '#93c5fd' : '#1d4ed8'} !important;
                }
                
                .simple-rich-editor strong {
                    font-weight: bold;
                }
                
                .simple-rich-editor em {
                    font-style: italic;
                }
                
                .simple-rich-editor u {
                    text-decoration: underline;
                }
                
                /* Placeholder styling for contentEditable */
                .simple-rich-editor[data-placeholder]:empty::before {
                    content: attr(data-placeholder);
                    color: ${isDarkMode ? '#6b7280' : '#9ca3af'};
                    font-style: normal;
                    pointer-events: none;
                    position: absolute;
                }
                
                /* Notion-like Dividers */
                .notion-divider {
                    margin: 16px 0;
                    display: flex;
                    align-items: center;
                }
                
                .notion-divider-line {
                    flex: 1;
                    height: 1px;
                    border: none;
                    background-color: ${isDarkMode ? '#374151' : '#e5e7eb'};
                    margin: 0;
                }
                
                /* Hover effects for interactive elements */
                .notion-divider:hover .notion-divider-line {
                    background-color: ${isDarkMode ? '#4b5563' : '#d1d5db'};
                    transition: background-color 0.2s ease;
                }
                `}
            </style>

            {/* Hidden File Input */}
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                multiple
                style={{ display: 'none' }}
                accept="*/*"
            />

            {/* Phase 4: User Confirmation Modal */}
            {showConfirmationModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10002]">
                    <div className={`rounded-lg p-6 w-full max-w-2xl mx-4 max-h-[80vh] overflow-y-auto ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className={`text-lg font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                                {confirmationTitle}
                            </h3>
                            <button
                                onClick={handleRejectAction}
                                className={`p-1 rounded-md transition-colors ${isDarkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500'}`}
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/>
                                </svg>
                            </button>
                        </div>
                        
                        <p className={`text-sm mb-4 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                            {confirmationMessage}
                        </p>
                        
                        {/* Content Preview */}
                        <div className="mb-6">
                            <div className="flex items-center justify-between mb-2">
                                <label className={`text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                                    Content Preview:
                                </label>
                                {!isEditingPreview && (
                                    <button
                                        onClick={handleEditPreview}
                                        className={`text-xs px-2 py-1 rounded transition-colors ${isDarkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}
                                    >
                                        Edit
                                    </button>
                                )}
                            </div>
                            
                            {isEditingPreview ? (
                                <div>
                                    <textarea
                                        value={editedPreviewContent}
                                        onChange={(e) => setEditedPreviewContent(e.target.value)}
                                        className={`w-full h-40 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm
                                            ${isDarkMode 
                                                ? 'bg-gray-700 border-gray-600 text-gray-100' 
                                                : 'bg-white border-gray-300 text-gray-900'
                                            }
                                        `}
                                        placeholder="Edit the content here..."
                                    />
                                    <div className="flex justify-end gap-2 mt-2">
                                        <button
                                            onClick={handleCancelPreviewEdit}
                                            className={`text-xs px-3 py-1 rounded transition-colors ${isDarkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleSavePreviewEdit}
                                            className="text-xs px-3 py-1 rounded transition-colors bg-blue-600 hover:bg-blue-700 text-white"
                                        >
                                            Save Changes
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div 
                                    className={`border rounded-md p-3 max-h-60 overflow-y-auto ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-300'}`}
                                    dangerouslySetInnerHTML={{ __html: previewContent }}
                                />
                            )}
                        </div>
                        
                        {/* Action Buttons */}
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={handleRejectAction}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors
                                    ${isDarkMode 
                                        ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' 
                                        : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                                    }
                                `}
                            >
                                ❌ Reject
                            </button>
                            <button
                                onClick={handleConfirmAction}
                                className="px-4 py-2 rounded-md text-sm font-medium transition-colors bg-green-600 hover:bg-green-700 text-white"
                            >
                                ✅ Approve & Execute
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Google Link Modal */}
            {showAddGoogleLinkModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10002]">
                    <div className={`rounded-lg p-6 w-full max-w-md mx-4 ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
                        <h3 className={`text-lg font-semibold mb-4 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                            Add Google Link
                        </h3>
                        
                        <div className="space-y-4">
                            <div>
                                <label className={`block text-sm font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                                    Title
                                </label>
                                <input
                                    type="text"
                                    value={googleLinkTitle}
                                    onChange={(e) => setGoogleLinkTitle(e.target.value)}
                                    placeholder="e.g., Meeting Notes"
                                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500
                                        ${isDarkMode 
                                            ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400' 
                                            : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                                        }
                                    `}
                                />
                            </div>
                            
                            <div>
                                <label className={`block text-sm font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                                    Google Docs/Sheets URL
                                </label>
                                <input
                                    type="url"
                                    value={googleLinkUrl}
                                    onChange={(e) => setGoogleLinkUrl(e.target.value)}
                                    placeholder="https://docs.google.com/... or https://sheets.google.com/..."
                                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500
                                        ${isDarkMode 
                                            ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400' 
                                            : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                                        }
                                    `}
                                />
                            </div>
                        </div>
                        
                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                onClick={() => {
                                    setShowAddGoogleLinkModal(false);
                                    setGoogleLinkTitle('');
                                    setGoogleLinkUrl('');
                                }}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors
                                    ${isDarkMode 
                                        ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' 
                                        : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                                    }
                                `}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleAddGoogleLink(googleLinkTitle, googleLinkUrl)}
                                disabled={!googleLinkTitle.trim() || !googleLinkUrl.trim()}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors
                                    ${isDarkMode 
                                        ? 'bg-blue-600 hover:bg-blue-700 text-white disabled:bg-gray-600 disabled:text-gray-400' 
                                        : 'bg-blue-500 hover:bg-blue-600 text-white disabled:bg-gray-300 disabled:text-gray-500'
                                    }
                                    disabled:cursor-not-allowed
                                `}
                            >
                                Add Link
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;
