import React, { useState, useEffect, useRef, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot, collection, deleteDoc, addDoc, Timestamp, getDocs, query } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
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
        { text: '💡', command: 'insertCallout', value: 'info', title: 'Info Callout' },
        { text: '⚠️', command: 'insertCallout', value: 'warning', title: 'Warning Callout' },
        { text: '✅', command: 'insertCallout', value: 'success', title: 'Success Callout' },
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
            } else if (btn.command === 'insertCallout') {
                // Save current state before inserting callout
                saveToUndoStack(editor.innerHTML);
                insertCallout(btn.value);
            } else if (btn.command === 'insertDivider') {
                // Save current state before inserting divider
                saveToUndoStack(editor.innerHTML);
                insertDivider();
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
    const insertCallout = (type) => {
        const calloutHtml = `
            <div class="notion-callout notion-callout-${type}" contenteditable="true">
                <div class="notion-callout-icon">${getCalloutIcon(type)}</div>
                <div class="notion-callout-content" contenteditable="true">Type your ${type} message here...</div>
            </div>
            <p><br></p>
        `;
        document.execCommand('insertHTML', false, calloutHtml);
    };
    
    const insertDivider = () => {
        const dividerHtml = `
            <div class="notion-divider">
                <hr class="notion-divider-line">
            </div>
            <p><br></p>
        `;
        document.execCommand('insertHTML', false, dividerHtml);
    };
    
    const getCalloutIcon = (type) => {
        switch (type) {
            case 'info': return '💡';
            case 'warning': return '⚠️';
            case 'success': return '✅';
            case 'error': return '❌';
            default: return '💡';
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
                    const textContent = tempDiv.textContent || tempDiv.innerText || '';
                    
                    // Find the text offset position
                    let textOffset = 0;
                    const walker = document.createTreeWalker(
                        editor,
                        NodeFilter.SHOW_TEXT,
                        null,
                        false
                    );
                    
                    let node;
                    while (node = walker.nextNode()) {
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
                            
                            while (node = walker.nextNode()) {
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

    // Selected text Q&A states
    const [selectedText, setSelectedText] = useState('');
    const [showSelectedTextMenu, setShowSelectedTextMenu] = useState(false);
    const [selectedTextPosition, setSelectedTextPosition] = useState({ x: 0, y: 0 });
    const [openOverflowMenu, setOpenOverflowMenu] = useState(null); // Track which node's overflow menu is open

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

    // Handle text selection for contextual Q&A - Moved early to avoid hoisting issues
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
                            setSelectedText(selectedTextContent);
                            setSelectedTextPosition({
                                x: Math.max(50, Math.min(window.innerWidth - 150, rect.left + (rect.width / 2))), // Keep within screen bounds
                                y: Math.max(50, rect.top - 60) // Position above selection with margin
                            });
                            setShowSelectedTextMenu(true);
                            console.log("Showing selected text menu at position:", {
                                x: rect.left + (rect.width / 2),
                                y: rect.top - 60
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
            
            // Hide menu if no valid selection
            setShowSelectedTextMenu(false);
            setSelectedText('');
        }, 50); // Slightly longer delay to ensure selection is complete
    }, []); // No dependencies needed since we're using state setters directly

    // Helper function to convert HTML to plain text
    const convertHtmlToPlainText = useCallback((html) => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        return doc.body.textContent || "";
    }, []);

    // Helper function to convert HTML/text to Editor.js format
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
            
            // Handle PDF files (basic extraction - client-side)
            if (fileType.includes('pdf') || fileName.endsWith('.pdf')) {
                setFileContentProcessingProgress(`Extracting text from PDF: ${file.name}...`);
                // For now, return a placeholder - PDF extraction requires additional libraries
                return `[PDF FILE: ${file.name}]\nThis PDF file has been uploaded but text extraction is not yet implemented. The file contains ${Math.round(file.size / 1024)}KB of data.`;
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

        // Load Editor.js and plugins with specific versions
        const loadScript = (src, globalName) => {
            return new Promise((resolve, reject) => {
                // Check if already loaded by looking for the global object
                if (globalName && window[globalName]) {
                    resolve();
                    return;
                }
                
                // Check if script tag already exists
                if (document.querySelector(`script[src="${src}"]`)) {
                    // Wait a bit for the script to execute
                    setTimeout(() => {
                        if (globalName && window[globalName]) {
                            resolve();
                        } else {
                            reject(new Error(`${globalName} not found after loading`));
                        }
                    }, 100);
                    return;
                }
                
                const script = document.createElement('script');
                script.src = src;
                script.async = true;
                script.onload = () => {
                    // Give the script time to execute and create global variables
                    setTimeout(() => {
                        if (!globalName || window[globalName]) {
                            resolve();
                        } else {
                            reject(new Error(`${globalName} not found after loading ${src}`));
                        }
                    }, 50);
                };
                script.onerror = () => reject(new Error(`Failed to load ${src}`));
                document.head.appendChild(script);
            });
        };

        const loadEditorJS = async () => {
            try {
                console.log("Starting to load Editor.js...");
                
                // Load Editor.js core with specific version - using unpkg as fallback
                try {
                    await loadScript('https://cdn.jsdelivr.net/npm/@editorjs/editorjs@2.28.2/dist/editor.js', 'EditorJS');
                } catch (e) {
                    console.log("jsdelivr failed, trying unpkg...");
                    await loadScript('https://unpkg.com/@editorjs/editorjs@2.28.2/dist/editor.js', 'EditorJS');
                }
                console.log("Editor.js core loaded");
                
                // Load plugins with specific versions
                try {
                    await loadScript('https://cdn.jsdelivr.net/npm/@editorjs/header@2.7.0/dist/bundle.js', 'Header');
                } catch (e) {
                    await loadScript('https://unpkg.com/@editorjs/header@2.7.0/dist/bundle.js', 'Header');
                }
                console.log("Header plugin loaded");
                
                try {
                    await loadScript('https://cdn.jsdelivr.net/npm/@editorjs/list@1.8.0/dist/bundle.js', 'List');
                } catch (e) {
                    await loadScript('https://unpkg.com/@editorjs/list@1.8.0/dist/bundle.js', 'List');
                }
                console.log("List plugin loaded");
                
                try {
                    await loadScript('https://cdn.jsdelivr.net/npm/@editorjs/checklist@1.5.0/dist/bundle.js', 'Checklist');
                } catch (e) {
                    await loadScript('https://unpkg.com/@editorjs/checklist@1.5.0/dist/bundle.js', 'Checklist');
                }
                console.log("Checklist plugin loaded");
                
                try {
                    await loadScript('https://cdn.jsdelivr.net/npm/@editorjs/quote@2.5.0/dist/bundle.js', 'Quote');
                } catch (e) {
                    await loadScript('https://unpkg.com/@editorjs/quote@2.5.0/dist/bundle.js', 'Quote');
                }
                console.log("Quote plugin loaded");
                
                try {
                    await loadScript('https://cdn.jsdelivr.net/npm/@editorjs/code@2.8.0/dist/bundle.js', 'CodeTool');
                } catch (e) {
                    await loadScript('https://unpkg.com/@editorjs/code@2.8.0/dist/bundle.js', 'CodeTool');
                }
                console.log("Code plugin loaded");
                
                try {
                    await loadScript('https://cdn.jsdelivr.net/npm/@editorjs/delimiter@1.3.0/dist/bundle.js', 'Delimiter');
                } catch (e) {
                    await loadScript('https://unpkg.com/@editorjs/delimiter@1.3.0/dist/bundle.js', 'Delimiter');
                }
                console.log("Delimiter plugin loaded");
                
                try {
                    await loadScript('https://cdn.jsdelivr.net/npm/@editorjs/marker@1.3.0/dist/bundle.js', 'Marker');
                } catch (e) {
                    await loadScript('https://unpkg.com/@editorjs/marker@1.3.0/dist/bundle.js', 'Marker');
                }
                console.log("Marker plugin loaded");
                
                try {
                    await loadScript('https://cdn.jsdelivr.net/npm/@editorjs/inline-code@1.4.0/dist/bundle.js', 'InlineCode');
                } catch (e) {
                    await loadScript('https://unpkg.com/@editorjs/inline-code@1.4.0/dist/bundle.js', 'InlineCode');
                }
                console.log("InlineCode plugin loaded");
                
                console.log("All Editor.js plugins loaded successfully");
            } catch (error) {
                console.error("Failed to load Editor.js:", error);
                // Set a flag to use fallback textarea
                window.editorJSLoadFailed = true;
            }
        };

        loadEditorJS();
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
                    setCurrentDocumentContent(data.content || '');
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

    // Initialize Editor.js with proper loading handling
    useEffect(() => {
        const initializeEditor = () => {
            if (editorElementRef.current && !editorRef.current && window.EditorJS) {
                try {
                    console.log("Initializing Editor.js...");
                    
                    // Parse existing content
                    let initialData = { blocks: [] };
                    if (currentDocumentContent) {
                        console.log('Converting content for editor:', currentDocumentContent.substring(0, 100) + '...');
                        initialData = convertToEditorFormat(currentDocumentContent);
                        console.log('Converted to editor format:', initialData);
                    }

                    // Create Editor.js instance with basic tools first
                    const tools = {};
                    
                    // Only add tools that are actually loaded
                    if (window.Header) tools.header = { class: window.Header, inlineToolbar: true };
                    if (window.List) tools.list = { class: window.List, inlineToolbar: true };
                    if (window.Checklist) tools.checklist = { class: window.Checklist, inlineToolbar: true };
                    if (window.Quote) tools.quote = { class: window.Quote, inlineToolbar: true };
                    if (window.CodeTool) tools.code = { class: window.CodeTool };
                    if (window.Delimiter) tools.delimiter = window.Delimiter;
                    if (window.Marker) tools.marker = { class: window.Marker, shortcut: 'CMD+SHIFT+M' };
                    if (window.InlineCode) tools.inlineCode = { class: window.InlineCode, shortcut: 'CMD+SHIFT+C' };

                    const editor = new window.EditorJS({
                        holder: editorElementRef.current,
                        placeholder: 'Type \'/\' for commands or start writing...',
                        data: initialData,
                        tools: tools,
                        onChange: async () => {
                            if (!editorRef.current) return;
                            
                            // Debounce the onChange to prevent saving after every keystroke
                            if (window.editorChangeTimeout) {
                                clearTimeout(window.editorChangeTimeout);
                            }
                            
                            window.editorChangeTimeout = setTimeout(async () => {
                                try {
                                    const savedData = await editorRef.current.save();
                                    const jsonContent = JSON.stringify(savedData);
                                    
                                    // Update the document content
                                    setCurrentDocumentContent(jsonContent);
                                    console.log("Editor.js content updated");
                                } catch (error) {
                                    console.error('Error saving editor content:', error);
                                }
                            }, 500); // Wait 500ms after user stops typing
                        }
                    });

                    // Save editor reference
                    editorRef.current = editor;

                    console.log("Editor.js initialized successfully - text selection listeners managed separately");

                    console.log("Editor.js initialized successfully");
                } catch (error) {
                    console.error("Failed to initialize Editor.js:", error);
                    
                    // Fallback to simple rich text editor
                    if (editorElementRef.current && !editorElementRef.current._richEditor?.isInitialized) {
                        window.setCurrentDocumentContent = setCurrentDocumentContent;
                        createSimpleRichEditor(editorElementRef.current, currentDocumentContent || '', setCurrentDocumentContent);
                    }
                }
            }
        };

        // Check if Editor.js is already loaded or failed to load
        if (window.editorJSLoadFailed) {
            console.log("Editor.js failed to load, using fallback textarea");
            // Show simple rich text editor fallback
            if (editorElementRef.current && !editorElementRef.current._richEditor?.isInitialized) {
                // Make state setter available globally for the editor
                window.setCurrentDocumentContent = setCurrentDocumentContent;
                createSimpleRichEditor(editorElementRef.current, currentDocumentContent || '', setCurrentDocumentContent);
            }
        } else if (window.EditorJS && window.Header && window.List) {
            initializeEditor();
        } else {
            // Show loading indicator while waiting for Editor.js
            if (editorElementRef.current) {
                editorElementRef.current.innerHTML = `
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 200px; color: #9ca3af;">
                        <div style="margin-bottom: 12px;">Loading rich text editor...</div>
                        <div style="display: flex; align-items: center;">
                            <div style="width: 16px; height: 16px; border: 2px solid #e5e7eb; border-top: 2px solid #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 8px;"></div>
                            <span style="font-size: 14px;">Editor.js loading</span>
                        </div>
                    </div>
                    <style>
                        @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                        }
                    </style>
                `;
            }
            
            // Wait for Editor.js to load
            let attempts = 0;
            const maxAttempts = 100; // 10 seconds
            
            const checkEditorLoaded = setInterval(() => {
                attempts++;
                
                if (window.editorJSLoadFailed) {
                    clearInterval(checkEditorLoaded);
                    console.log("Editor.js failed to load, using fallback textarea");
                    // Show simple rich text editor fallback
                    if (editorElementRef.current && !editorElementRef.current._richEditor?.isInitialized) {
                        window.setCurrentDocumentContent = setCurrentDocumentContent;
                        createSimpleRichEditor(editorElementRef.current, currentDocumentContent || '', setCurrentDocumentContent);
                    }
                } else if (window.EditorJS && window.Header && window.List) {
                    clearInterval(checkEditorLoaded);
                    initializeEditor();
                } else if (attempts >= maxAttempts) {
                    clearInterval(checkEditorLoaded);
                    console.log("Editor.js load timeout, using fallback textarea");
                    // Show simple rich text editor fallback
                    if (editorElementRef.current && !editorElementRef.current._richEditor?.isInitialized) {
                        window.setCurrentDocumentContent = setCurrentDocumentContent;
                        createSimpleRichEditor(editorElementRef.current, currentDocumentContent || '', setCurrentDocumentContent);
                    }
                }
            }, 100);
        }
        
        // Cleanup
        return () => {
            if (editorRef.current && editorRef.current.destroy) {
                editorRef.current.destroy();
                editorRef.current = null;
            }
        };
    }, [isAuthReady]); // Removed handleTextSelection dependency

    // Separate useEffect for text selection listeners
    useEffect(() => {
        console.log("Setting up text selection listeners");
        
        // Add text selection listeners for contextual Q&A
        document.addEventListener('mouseup', handleTextSelection);
        document.addEventListener('keyup', handleTextSelection);
        
        // Also add selectionchange for better detection
        document.addEventListener('selectionchange', handleTextSelection);
        
        console.log("Text selection listeners attached to document");
        
        // Cleanup
        return () => {
            document.removeEventListener('mouseup', handleTextSelection);
            document.removeEventListener('keyup', handleTextSelection);
            document.removeEventListener('selectionchange', handleTextSelection);
            console.log("Text selection listeners removed");
        };
    }, [handleTextSelection]); // This useEffect depends on handleTextSelection

    // Separate useEffect to update editor content when document changes
    useEffect(() => {
        const updateEditorContent = async () => {
            if (!currentDocumentId) {
                // Clear editor if no document selected
                if (editorRef.current) {
                    try {
                        await editorRef.current.render({ blocks: [] });
                        console.log("Editor.js cleared for no document");
                    } catch (error) {
                        console.error("Error clearing Editor.js:", error);
                    }
                } else if (editorElementRef.current?._richEditor) {
                    // Clear rich text editor using the updateContent method
                    editorElementRef.current._richEditor.updateContent('');
                }
                return;
            }

            // Update Editor.js content when document changes
            if (editorRef.current) {
                try {
                    console.log('Updating editor with content:', currentDocumentContent?.substring(0, 100) + '...');
                    const newData = convertToEditorFormat(currentDocumentContent || '');
                    console.log('Converted data for editor:', newData);
                    await editorRef.current.render(newData);
                    console.log("Editor.js content updated successfully for document:", currentDocumentId);
                } catch (error) {
                    console.error("Failed to update Editor.js content:", error);
                }
                         } else if (editorElementRef.current?._richEditor) {
                // Update rich text editor content using the updateContent method
                // Only update if content has actually changed to prevent cursor jumping
                const currentEditorContent = editorElementRef.current._richEditor.editor?.innerHTML || '';
                const newContent = currentDocumentContent || '';
                
                if (currentEditorContent !== newContent) {
                    editorElementRef.current._richEditor.updateContent(newContent);
                    console.log("Rich text editor content updated for document:", currentDocumentId);
                } else {
                    console.log("Rich text editor content unchanged, skipping update");
                }
            }
        };

        updateEditorContent();
    }, [currentDocumentId, currentDocumentContent, convertToEditorFormat]); // Added missing dependencies

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

    // File Management Functions - Phase 1: File Upload
    const handleFileUpload = async (event) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        // Use anonymous userId if none available
        const activeUserId = userId || 'anonymous-user';
        console.log('File upload starting with userId:', activeUserId);
        setIsUploadingFile(true);
        setFileUploadProgress('Preparing upload...');

        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                setFileUploadProgress(`Uploading ${file.name} (${i + 1}/${files.length})`);

                // Create unique filename to avoid collisions
                const uniqueFileName = `${file.name}_${crypto.randomUUID()}`;
                const filePath = `user_uploads/${activeUserId}/uploaded_docs/${uniqueFileName}`;

                // Create storage reference
                const storageRef = ref(storage, filePath);

                // Upload file
                await uploadBytes(storageRef, file);

                // Get download URL
                const downloadURL = await getDownloadURL(storageRef);

                // Phase 2: Extract file content for LLM analysis
                setFileUploadProgress(`Extracting content from ${file.name}...`);
                const extractedContent = await extractFileContent(file, downloadURL);

                // Save metadata to Firestore (including extracted content)
                const fileMetadata = {
                    fileName: file.name,
                    fileType: file.type,
                    fileSize: file.size,
                    downloadURL: downloadURL,
                    uploadDate: Timestamp.now(),
                    associatedPageId: currentDocumentId || null,
                    // Phase 2: Store extracted content for LLM
                    extractedContent: extractedContent,
                    contentExtracted: true,
                    lastProcessed: Timestamp.now()
                };

                const docRef = await addDoc(collection(db, `artifacts/${appId}/users/${activeUserId}/uploaded_files`), fileMetadata);
                console.log(`File ${file.name} uploaded with document ID: ${docRef.id}`);
                console.log(`File ${file.name} uploaded successfully`);
            }

            setFileUploadProgress('Upload complete!');
            setSaveStatus(`${files.length} file(s) uploaded successfully`);
        } catch (error) {
            console.error('Error uploading files:', error);
            setFileUploadProgress('Upload failed');
            setSaveStatus('Error uploading files');
        } finally {
            setIsUploadingFile(false);
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

            const linkMetadata = {
                id: crypto.randomUUID(),
                title: title.trim(),
                url: url.trim(),
                linkType: linkType,
                addDate: Timestamp.now(),
                associatedPageId: currentDocumentId || null
            };

            const activeUserId = userId || 'anonymous-user';
            await addDoc(collection(db, `artifacts/${appId}/users/${activeUserId}/google_links`), linkMetadata);
            console.log('Google link added successfully');

            // Reset form
            setGoogleLinkTitle('');
            setGoogleLinkUrl('');
            setShowAddGoogleLinkModal(false);
            setSaveStatus('Google link added successfully');
        } catch (error) {
            console.error('Error adding Google link:', error);
            setSaveStatus('Error adding Google link');
        }
    };

    const handleDeleteGoogleLink = async (linkId) => {
        if (!window.confirm('Are you sure you want to delete this link?')) return;

        try {
            const activeUserId = userId || 'anonymous-user';
            await deleteDoc(doc(db, `artifacts/${appId}/users/${activeUserId}/google_links`, linkId));
            setSaveStatus('Link deleted');
        } catch (error) {
            console.error('Error deleting link:', error);
            setSaveStatus('Error deleting link');
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

                // Combine documents and files
                const allContent = [documentsText, uploadedFilesText].filter(text => text.trim()).join('\n\n===== UPLOADED FILES =====\n\n');

                const contextualQuestion = `You are a helpful AI assistant analyzing a user's personal notes, documents, and uploaded files. Please provide accurate, helpful responses based on the content provided.

USER QUESTION: ${question}

COMPLETE KNOWLEDGE BASE:
${allContent}

Instructions:
- Answer based on the documents and uploaded files provided above
- You have access to both notes/documents and uploaded file contents
- If the answer isn't in the provided content, clearly state that
- Be specific and reference relevant document titles and file names when helpful
- Cross-reference information between documents and uploaded files when relevant
- Provide a clear, well-structured response
- Also suggest 3-5 concise search terms for finding additional information online

IMPORTANT: Return your response as a JSON object with exactly this structure:
{
  "answer": "Your comprehensive answer here",
  "search_terms": ["search term 1", "search term 2", "search term 3"]
}`;

                // Include recent chat history (last 8 messages to manage token usage)
                const recentHistory = newChatHistory.slice(-1);
                recentHistory[0] = { role: "user", parts: [{ text: contextualQuestion }] };
                payload = { 
                    contents: recentHistory,
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
                // Continuing conversation - use recent history without re-adding document context
                const recentHistory = newChatHistory.slice(-8); // Last 8 messages
                payload = { contents: recentHistory };
            }
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
                
                const aiResponseText = result.candidates[0].content.parts[0].text;
                
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

    const handleExportDocument = () => {
        if (!currentDocumentId) {
            setLlmResponse("Please select a document to export.");
            return;
        }
        const fileName = `${currentDocumentTitle || 'untitled'}.md`;
        
        // Handle both Editor.js (JSON) and HTML content for export
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
        
        const blob = new Blob([plainTextContent], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setLlmResponse("Document exported successfully!");
    };

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (templateMenuRef.current && !templateMenuRef.current.contains(event.target)) {
                setShowTemplateMenu(false);
            }
            if (showSelectedTextMenu && !event.target.closest('.ask-ai-menu')) {
                setShowSelectedTextMenu(false);
            }
            // Close overflow menu when clicking outside
            if (openOverflowMenu && !event.target.closest('.overflow-menu')) {
                setOpenOverflowMenu(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showSelectedTextMenu, openOverflowMenu]);

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
                                                {file.contentExtracted && (
                                                    <span className="ml-2 text-green-600">• AI Ready</span>
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
                                googleLinks.map(link => (
                                    <div key={link.id} className={`flex items-center px-2 py-1.5 rounded-md transition-colors group
                                        ${isDarkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}
                                    `}>
                                        <span className="text-lg mr-2">{getLinkIcon(link.linkType)}</span>
                                        <div className="flex-1 min-w-0">
                                            <button
                                                onClick={() => window.open(link.url, '_blank')}
                                                className={`text-sm truncate block w-full text-left hover:underline
                                                    ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}
                                                `}
                                                title={link.title}
                                            >
                                                {link.title}
                                            </button>
                                            <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                                                {link.linkType === 'google_doc' ? 'Google Doc' : 'Google Sheet'}
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
                                ))
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
                            {/* Notion-like Hover Toolbar */}
                            <div className={`absolute -top-12 left-0 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-200 z-50 
                                px-3 py-2 rounded-lg shadow-lg border
                                ${isDarkMode ? 'bg-gray-800 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-700'}
                            `}>
                                <button
                                    onClick={() => setShowIconPicker(!showIconPicker)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors font-medium
                                        ${isDarkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600'}
                                    `}
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <circle cx="12" cy="12" r="10"></circle>
                                        <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                                        <line x1="9" y1="9" x2="9.01" y2="9"></line>
                                        <line x1="15" y1="9" x2="15.01" y2="9"></line>
                                    </svg>
                                    Add icon
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
                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors font-medium
                                        ${isDarkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600'}
                                        ${isUploadingCover ? 'opacity-50 cursor-not-allowed' : ''}
                                    `}>
                                    {isUploadingCover ? (
                                        <div className="animate-spin rounded-full h-4 w-4 border-t border-current"></div>
                                    ) : (
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
                                            <polyline points="16,6 12,2 8,6"></polyline>
                                            <line x1="12" y1="2" x2="12" y2="15"></line>
                                        </svg>
                                    )}
                                    {isUploadingCover ? (uploadProgress || 'Uploading...') : 'Add cover'}
                                </button>
                            </div>
                            
                            {/* Document Icon and Title */}
                            <div className="flex items-start gap-3">
                                <button
                                    onClick={() => setShowIconPicker(!showIconPicker)}
                                    className={`text-4xl hover:bg-gray-100 rounded-lg p-1 transition-colors duration-200 cursor-pointer
                                        ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}
                                    `}
                                    title="Change icon"
                                >
                                    {currentDocumentIcon}
                                </button>
                                
                                <input
                                    type="text"
                                    className={`flex-1 text-4xl font-extrabold p-2 bg-transparent border-none focus:outline-none
                                        ${isDarkMode ? 'text-gray-200 placeholder-gray-500' : 'text-gray-900 placeholder-gray-300'}`}
                                    value={currentDocumentTitle}
                                    onChange={(e) => setCurrentDocumentTitle(e.target.value)}
                                    placeholder="New page"
                                />
                                {currentDocumentContent?.trim() && (
                                    <button
                                        onClick={getSuggestedTitles}
                                        disabled={isLoadingTitleSuggestions}
                                        className={`ml-2 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center gap-1
                                            ${isDarkMode ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-blue-500 text-white hover:bg-blue-600'}
                                            disabled:opacity-50 disabled:cursor-not-allowed
                                        `}
                                        title="Generate title suggestions based on content"
                                    >
                                        {isLoadingTitleSuggestions ? (
                                            <>
                                                <div className="animate-spin rounded-full h-3 w-3 border-t border-white"></div>
                                                <span>AI...</span>
                                            </>
                                        ) : (
                                            <>
                                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                                </svg>
                                                <span>Title</span>
                                            </>
                                        )}
                                    </button>
                                )}
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
                            {/* Tags input/display */}
                            <div className="mb-4">
                                <div className="flex flex-wrap items-center gap-2 mb-2">
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
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <input
                                        type="text"
                                        className={`flex-grow min-w-[150px] max-w-xs p-1.5 rounded-md text-sm
                                            ${isDarkMode ? 'bg-gray-700 text-gray-200 placeholder-gray-400 border-gray-600' : 'bg-gray-50 text-gray-800 placeholder-gray-500 border-gray-300'}
                                            border focus:outline-none focus:ring-1 focus:ring-blue-400
                                        `}
                                        placeholder="Add tag (e.g., 'work, idea')"
                                        onKeyPress={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault(); // Prevent new line in editor
                                                const tagsToAdd = e.target.value.split(',').map(t => t.trim()).filter(Boolean);
                                                tagsToAdd.forEach(tag => handleAddTag(tag));
                                                e.target.value = '';
                                            }
                                        }}
                                    />
                                    {currentDocumentContent?.trim() && (
                                        <button
                                            onClick={getSuggestedTags}
                                            disabled={isLoadingSuggestions}
                                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-200 flex items-center gap-1
                                                ${isDarkMode ? 'bg-purple-600 text-white hover:bg-purple-700' : 'bg-purple-500 text-white hover:bg-purple-600'}
                                                disabled:opacity-50 disabled:cursor-not-allowed
                                            `}
                                        >
                                            {isLoadingSuggestions ? (
                                                <>
                                                    <div className="animate-spin rounded-full h-3 w-3 border-t border-white"></div>
                                                    <span>AI...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                                    </svg>
                                                    <span>AI Tags</span>
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>
                                {/* AI Suggested Tags */}
                                {suggestedTags.length > 0 && (
                                    <div className="mt-2">
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

                    {/* Floating Ask AI Button for Selected Text */}
                    {showSelectedTextMenu && (
                        <div 
                            className={`fixed cursor-pointer px-2 py-1.5 rounded shadow-lg flex items-center gap-1.5 transition-all duration-200 hover:scale-105
                                ${isDarkMode 
                                    ? 'bg-gray-700 text-gray-100 border border-gray-600' 
                                    : 'bg-gray-800 text-white border border-gray-700'
                                }`}
                            style={{
                                left: selectedTextPosition.x,
                                top: selectedTextPosition.y - 2, // Almost touching - just 2px above
                                transform: 'translateX(-50%)', // Only center horizontally
                                zIndex: 10000,
                                fontSize: '11px',
                                fontWeight: '500',
                                whiteSpace: 'nowrap',
                                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
                            }}
                            onMouseDown={(e) => {
                                console.log("Ask AI tooltip mousedown!");
                                e.preventDefault();
                                e.stopPropagation();
                                
                                // Automatically ask about the selected text
                                const question = `Tell me about "${selectedText}"`;
                                console.log("Auto-generated question:", question);
                                console.log("Selected text:", selectedText);
                                console.log("askLlm function:", typeof askLlm);
                                
                                // Hide the menu first
                                setShowSelectedTextMenu(false);
                                
                                // Call askLlm
                                try {
                                    askLlm(question, selectedText);
                                    console.log("askLlm called successfully");
                                } catch (error) {
                                    console.error("Error calling askLlm:", error);
                                }
                            }}
                        >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                            </svg>
                            <span>Ask AI</span>
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

                    <div className="mt-4 text-xs text-right">
                        <span className={isDarkMode ? 'text-gray-500' : 'text-gray-500'}>{saveStatus}</span>
                        {currentDocumentId && (
                            <button
                                onClick={handleExportDocument}
                                className={`ml-4 px-3 py-1 rounded-md text-xs font-medium
                                    ${isDarkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}
                                    transition-colors duration-200`}
                            >
                                Export (.md)
                            </button>
                        )}
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
                    {llmLoading && (
                        <div className="flex items-center justify-center mt-4">
                            <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-blue-500"></div>
                            <span className={`ml-2 text-sm ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`}>
                                {llmLoadingMessage || 'Thinking...'}
                            </span>
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

                <input
                    type="text"
                    className={`w-full p-2.5 rounded-md border focus:outline-none focus:ring-1 focus:ring-blue-400 mb-3 text-sm placeholder-gray-400
                        ${isDarkMode ? 'bg-gray-700 text-gray-200 border-gray-600' : 'bg-white text-gray-800 border-gray-300'}`}
                    placeholder="Ask AI about your documents..."
                    value={llmQuestion}
                    onChange={(e) => setLlmQuestion(e.target.value)}
                    onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                            askLlm();
                        }
                    }}
                    disabled={llmLoading || documents.length === 0}
                />
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
                }
                
                .simple-rich-editor li {
                    margin: 4px 0;
                }
                
                .simple-rich-editor p {
                    margin: 8px 0;
                    color: ${isDarkMode ? '#e5e7eb' : '#1f2937'};
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
                
                /* Notion-like Callout Blocks */
                .notion-callout {
                    display: flex;
                    align-items: flex-start;
                    padding: 12px 16px;
                    margin: 8px 0;
                    border-radius: 8px;
                    border-left: 4px solid;
                    font-size: 14px;
                    line-height: 1.5;
                }
                
                .notion-callout-icon {
                    font-size: 16px;
                    margin-right: 8px;
                    flex-shrink: 0;
                    line-height: 1.5;
                }
                
                .notion-callout-content {
                    flex: 1;
                    outline: none;
                    min-height: 20px;
                }
                
                /* Info Callout (Blue) */
                .notion-callout-info {
                    background-color: ${isDarkMode ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)'};
                    border-left-color: ${isDarkMode ? '#60a5fa' : '#3b82f6'};
                    color: ${isDarkMode ? '#93c5fd' : '#1e40af'};
                }
                
                /* Warning Callout (Yellow) */
                .notion-callout-warning {
                    background-color: ${isDarkMode ? 'rgba(245, 158, 11, 0.1)' : 'rgba(245, 158, 11, 0.05)'};
                    border-left-color: ${isDarkMode ? '#fbbf24' : '#f59e0b'};
                    color: ${isDarkMode ? '#fcd34d' : '#92400e'};
                }
                
                /* Success Callout (Green) */
                .notion-callout-success {
                    background-color: ${isDarkMode ? 'rgba(34, 197, 94, 0.1)' : 'rgba(34, 197, 94, 0.05)'};
                    border-left-color: ${isDarkMode ? '#4ade80' : '#22c55e'};
                    color: ${isDarkMode ? '#86efac' : '#166534'};
                }
                
                /* Error Callout (Red) */
                .notion-callout-error {
                    background-color: ${isDarkMode ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.05)'};
                    border-left-color: ${isDarkMode ? '#f87171' : '#ef4444'};
                    color: ${isDarkMode ? '#fca5a5' : '#991b1b'};
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
                .notion-callout:hover {
                    transform: translateY(-1px);
                    transition: transform 0.2s ease;
                    box-shadow: 0 2px 8px ${isDarkMode ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.1)'};
                }
                
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

            {/* Google Link Modal */}
            {showAddGoogleLinkModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
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
