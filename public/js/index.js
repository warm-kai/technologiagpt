const textarea = document.getElementById('question');
const sendBtn = document.getElementById('sendBtn');
const subjectButtons = document.querySelectorAll('.subject-btn');
const messagesContainer = document.getElementById('messages');
const historyList = document.getElementById('historyList');
const typingIndicator = document.getElementById('typing');
const scrollToBottomBtn = document.getElementById('scrollToBottom');
const chatArea = document.getElementById('chatArea');
const searchBar = document.getElementById('searchBar');
const newChatBtn = document.getElementById('newChatBtn');
const confirmationDialog = document.getElementById('confirmationDialog');
const overlay = document.getElementById('overlay');
const topicToDeleteSpan = document.getElementById('topicToDelete');
const confirmDeleteBtn = document.getElementById('confirmDelete');
const cancelDeleteBtn = document.getElementById('cancelDelete');
const contextMenu = document.getElementById('contextMenu');
const contextDelete = document.getElementById('contextDelete');
const contextRename = document.getElementById('contextRename');
const contextPin = document.getElementById('contextPin');
const toggleSidebar = document.getElementById('toggleSidebar');
const sidebar = document.getElementById('sidebar');
const topicTitle = document.getElementById('topicTitle');

let currentTopicId = null;
let contextTopicId = null;
let currentSubject = 'Maths'; // Default subject

// Generate a unique topic ID
function generateTopicId() {
  return `Topic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Format large numbers with commas
function formatNumber(numStr) {
  return numStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

async function typesetMathJax(element) {
  if (!element) {
    console.warn('No element provided for MathJax typesetting.');
    return;
  }
  if (window.MathJax && window.MathJax.Hub) {
    try {
      MathJax.Hub.Queue(["Typeset", MathJax.Hub, element]);
    } catch (err) {
      console.error('MathJax Error:', err);
      showToast('Failed to render math content.', 'error');
    }
  } else {
    console.warn('MathJax not loaded yet.');
    showToast('Math rendering unavailable.', 'error');
  }
}

function showToast(message, type = 'error') {
  const toast = document.createElement('div');
  toast.style.position = 'fixed';
  toast.style.bottom = '20px';
  toast.style.right = '20px';
  toast.style.padding = '1rem';
  toast.style.background = type === 'error' ? '#ff4444' : '#00aaff';
  toast.style.color = 'white';
  toast.style.borderRadius = '8px';
  toast.style.zIndex = '1000';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function showConfirmationDialog(topicTitle, callback) {
  if (!confirmationDialog || !overlay || !topicToDeleteSpan) {
    console.error('Confirmation dialog elements not found.');
    showToast('Cannot show confirmation dialog.', 'error');
    return;
  }
  topicToDeleteSpan.textContent = topicTitle;
  confirmationDialog.style.display = 'flex';
  overlay.style.display = 'block';
  confirmDeleteBtn.onclick = () => {
    callback();
    confirmationDialog.style.display = 'none';
    overlay.style.display = 'none';
  };
  cancelDeleteBtn.onclick = () => {
    confirmationDialog.style.display = 'none';
    overlay.style.display = 'none';
  };
}

function showContextMenu(e, topicId) {
  if (!contextMenu) {
    console.error('Context menu element not found.');
    showToast('Cannot show context menu.', 'error');
    return;
  }
  e.preventDefault();
  contextTopicId = topicId;
  const menuWidth = contextMenu.offsetWidth;
  const menuHeight = contextMenu.offsetHeight;
  const x = Math.min(e.pageX, window.innerWidth - menuWidth - 10);
  const y = Math.min(e.pageY, window.innerHeight - menuHeight - 10);
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
  contextMenu.style.display = 'block';
  contextPin.textContent = window.groupedMessages[topicId]?.pinned ? 'Unpin' : 'Pin';
  document.addEventListener('click', hideContextMenu, { once: true });
}

function hideContextMenu() {
  if (contextMenu) {
    contextMenu.style.display = 'none';
  }
}

if (toggleSidebar) {
  toggleSidebar.addEventListener('click', () => {
    if (sidebar) {
      sidebar.classList.toggle('active');
    }
  });
}

if (textarea) {
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (sendBtn) {
        sendBtn.click();
      }
    }
  });
}

async function createNewTopic() {
  currentTopicId = generateTopicId();
  if (topicTitle) {
    topicTitle.textContent = currentTopicId;
  }
  if (messagesContainer) {
    messagesContainer.innerHTML = '';
  }
  await fetchHistory();
  checkScrollButton();
}

// Handle subject button clicks
subjectButtons.forEach(button => {
  button.addEventListener('click', () => {
    subjectButtons.forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');
    currentSubject = button.dataset.subject;
  });
});

if (sendBtn) {
  sendBtn.addEventListener('click', async () => {
    if (!textarea) return;
    const questionText = textarea.value.trim();
    if (!questionText) return;

    if (!currentTopicId) {
      await createNewTopic();
    }

    const wasAtBottom = chatArea && chatArea.scrollHeight - chatArea.scrollTop <= chatArea.clientHeight;

    const userMsg = document.createElement('div');
    userMsg.className = 'message user-message';
    userMsg.textContent = questionText;
    const copyIcon = document.createElement('span');
    copyIcon.className = 'copy-icon';
    copyIcon.innerHTML = '<i class="fas fa-copy"></i>';
    copyIcon.addEventListener('click', () => {
      navigator.clipboard.writeText(questionText).then(() => {
        copyIcon.innerHTML = '<i class="fas fa-check"></i>';
        copyIcon.classList.add('copied');
        setTimeout(() => {
          copyIcon.innerHTML = '<i class="fas fa-copy"></i>';
          copyIcon.classList.remove('copied');
        }, 2000);
      });
    });
    userMsg.appendChild(copyIcon);
    if (messagesContainer) {
      messagesContainer.appendChild(userMsg);
      requestAnimationFrame(() => {
        userMsg.className = 'message user-message';
      });
    }

    textarea.value = '';
    if (typingIndicator) {
      typingIndicator.style.display = 'flex';
    }

    try {
      const res = await fetch('/api/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: questionText, subject: currentSubject, topicId: currentTopicId })
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      if (typingIndicator) {
        typingIndicator.style.display = 'none';
      }

      const aiMsg = document.createElement('div');
      aiMsg.className = 'message ai-message';
      const parsedAnswer = data.answer
        .replace(/\\\(/g, '<span class="math">\\(')
        .replace(/\\\)/g, '\\)</span>')
        .replace(/\\\[([\s\S]*?)\\\]/g, '<div class="math display">[$1]</div>')
        .replace(/Final Answer: \\\\boxed\{([\s\S]*?)\}/g, '<div class="final-answer">\\[$1\\]</div>')
        .replace(/\d{4,}/g, formatNumber);
      aiMsg.innerHTML = marked.parse(parsedAnswer);
      const aiCopyIcon = document.createElement('span');
      aiCopyIcon.className = 'copy-icon';
      aiCopyIcon.innerHTML = '<i class="fas fa-copy"></i>';
      aiCopyIcon.addEventListener('click', () => {
        navigator.clipboard.writeText(data.answer).then(() => {
          aiCopyIcon.innerHTML = '<i class="fas fa-check"></i>';
          aiCopyIcon.classList.add('copied');
          setTimeout(() => {
            aiCopyIcon.innerHTML = '<i class="fas fa-copy"></i>';
            aiCopyIcon.classList.remove('copied');
          }, 2000);
        });
      });
      aiMsg.appendChild(aiCopyIcon);
      if (messagesContainer) {
        messagesContainer.appendChild(aiMsg);
        requestAnimationFrame(() => {
          aiMsg.className = 'message ai-message';
        });
      }

      await typesetMathJax(aiMsg);

      if (data.topicId && data.topicId !== currentTopicId) {
        currentTopicId = data.topicId;
        if (topicTitle) {
          topicTitle.textContent = currentTopicId;
        }
      }

      await fetchHistory();
      if (wasAtBottom && chatArea) {
        chatArea.scrollTop = chatArea.scrollHeight;
      }
      checkScrollButton();
    } catch (err) {
      console.error('Error in sendBtn handler:', err);
      if (typingIndicator) {
        typingIndicator.style.display = 'none';
      }
      showToast(`Error: ${err.message}`, 'error');
    }
  });
}

async function fetchHistory(searchQuery = '') {
  try {
    const res = await fetch('/api/history');
    const groupedMessages = await res.json();
    if (historyList) {
      historyList.innerHTML = '';
    }

    Object.keys(groupedMessages)
      .filter(topic => topic.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => {
        const aPinned = groupedMessages[a].pinned ? 1 : 0;
        const bPinned = groupedMessages[b].pinned ? 1 : 0;
        return bPinned - aPinned || a.localeCompare(b);
      })
      .forEach(topicTitle => {
        const topicItem = document.createElement('div');
        topicItem.className = `history-topic ${groupedMessages[topicTitle].pinned ? 'pinned' : ''}`;
        topicItem.textContent = topicTitle;
        topicItem.dataset.topicId = topicTitle;

        topicItem.addEventListener('click', async (e) => {
          currentTopicId = topicTitle;
          if (topicTitle) {
            topicTitle.textContent = currentTopicId;
          }
          if (messagesContainer) {
            messagesContainer.innerHTML = '';
          }
          const messages = groupedMessages[topicTitle].messages || [];
          messages.forEach(msg => {
            const userMsg = document.createElement('div');
            userMsg.className = 'message user-message';
            userMsg.textContent = msg.question;
            const userCopyIcon = document.createElement('span');
            userCopyIcon.className = 'copy-icon';
            userCopyIcon.innerHTML = '<i class="fas fa-copy"></i>';
            userCopyIcon.addEventListener('click', () => {
              navigator.clipboard.writeText(msg.question).then(() => {
                userCopyIcon.innerHTML = '<i class="fas fa-check"></i>';
                userCopyIcon.classList.add('copied');
                setTimeout(() => {
                  userCopyIcon.innerHTML = '<i class="fas fa-copy"></i>';
                  userCopyIcon.classList.remove('copied');
                }, 2000);
              });
            });
            userMsg.appendChild(userCopyIcon);
            if (messagesContainer) {
              messagesContainer.appendChild(userMsg);
            }

            const aiMsg = document.createElement('div');
            aiMsg.className = 'message ai-message';
            const parsedAnswer = msg.answer
              .replace(/\\\(/g, '<span class="math">\\(')
              .replace(/\\\)/g, '\\)</span>')
              .replace(/\\\[([\s\S]*?)\\\]/g, '<div class="math display">[$1]</div>')
              .replace(/Final Answer: \\\\boxed\{([\s\S]*?)\}/g, '<div class="final-answer">\\[$1\\]</div>')
              .replace(/\d{4,}/g, formatNumber);
            aiMsg.innerHTML = marked.parse(parsedAnswer);
            const aiCopyIcon = document.createElement('span');
            aiCopyIcon.className = 'copy-icon';
            aiCopyIcon.innerHTML = '<i class="fas fa-copy"></i>';
            aiCopyIcon.addEventListener('click', () => {
              navigator.clipboard.writeText(msg.answer).then(() => {
                aiCopyIcon.innerHTML = '<i class="fas fa-check"></i>';
                aiCopyIcon.classList.add('copied');
                setTimeout(() => {
                  aiCopyIcon.innerHTML = '<i class="fas fa-copy"></i>';
                  aiCopyIcon.classList.remove('copied');
                }, 2000);
              });
            });
            aiMsg.appendChild(aiCopyIcon);
            if (messagesContainer) {
              messagesContainer.appendChild(aiMsg);
            }
          });
          await typesetMathJax(messagesContainer);
          if (chatArea) {
            chatArea.scrollTop = chatArea.scrollHeight;
          }
          checkScrollButton();
          if (sidebar) {
            sidebar.classList.remove('active');
          }
          showContextMenu(e, topicTitle);
        });

        topicItem.addEventListener('contextmenu', (e) => {
          showContextMenu(e, topicTitle);
        });

        topicItem.addEventListener('mouseenter', () => {
          if (topicItem) {
            topicItem.style.backgroundColor = 'var(--hover-bg)';
            topicItem.style.transform = 'translateX(5px)';
          }
        });
        topicItem.addEventListener('mouseleave', () => {
          if (topicItem) {
            topicItem.style.backgroundColor = '';
            topicItem.style.transform = 'translateX(0)';
          }
        });

        if (historyList) {
          historyList.appendChild(topicItem);
        }
      });
    window.groupedMessages = groupedMessages;
  } catch (err) {
    console.error('Failed to fetch history:', err);
    showToast('Failed to fetch history.', 'error');
  }
}

if (contextDelete) {
  contextDelete.addEventListener('click', async () => {
    showConfirmationDialog(contextTopicId, async () => {
      try {
        const res = await fetch(`/api/topic/${encodeURIComponent(contextTopicId)}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        if (currentTopicId === contextTopicId) {
          currentTopicId = null;
          if (topicTitle) {
            topicTitle.textContent = '';
          }
          if (messagesContainer) {
            messagesContainer.innerHTML = '';
          }
        }
        await fetchHistory();
      } catch (err) {
        console.error('Delete Error:', err);
        showToast('Failed to delete topic: ' + err.message, 'error');
      }
    });
  });
}

if (contextRename) {
  contextRename.addEventListener('click', async () => {
    const newTitle = prompt('Enter new topic title:', contextTopicId);
    if (newTitle && newTitle.trim()) {
      try {
        const res = await fetch(`/api/topic/${encodeURIComponent(contextTopicId)}/rename`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newTitle: newTitle.trim() })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        if (currentTopicId === contextTopicId) {
          currentTopicId = newTitle.trim();
          if (topicTitle) {
            topicTitle.textContent = currentTopicId;
          }
        }
        await fetchHistory();
      } catch (err) {
        console.error('Rename Error:', err);
        showToast('Failed to rename topic: ' + err.message, 'error');
      }
    }
  });
}

if (contextPin) {
  contextPin.addEventListener('click', async () => {
    const isPinned = window.groupedMessages[contextTopicId]?.pinned || false;
    try {
      const res = await fetch(`/api/topic/${encodeURIComponent(contextTopicId)}/pin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: !isPinned })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await fetchHistory();
    } catch (err) {
      console.error('Pin Error:', err);
      showToast('Failed to pin/unpin topic: ' + err.message, 'error');
    }
  });
}

function checkScrollButton() {
  if (scrollToBottomBtn && chatArea) {
    scrollToBottomBtn.style.display = chatArea.scrollTop < chatArea.scrollHeight - chatArea.clientHeight - 10 ? 'block' : 'none';
  }
}

if (scrollToBottomBtn) {
  scrollToBottomBtn.addEventListener('click', () => {
    if (chatArea) {
      chatArea.scrollTop = chatArea.scrollHeight;
    }
  });
}

if (chatArea) {
  chatArea.addEventListener('scroll', checkScrollButton);
}

if (newChatBtn) {
  newChatBtn.addEventListener('click', async () => {
    await createNewTopic();
    if (sidebar) {
      sidebar.classList.remove('active');
    }
  });
}

if (searchBar) {
  searchBar.addEventListener('input', () => fetchHistory(searchBar.value));
}

document.addEventListener('keydown', (e) => {
  const isMac = navigator.platform.includes('Mac');
  const ctrlKey = isMac ? e.metaKey : e.ctrlKey;

  if (ctrlKey && e.shiftKey && e.key.toLowerCase() === 'o') {
    e.preventDefault();
    if (newChatBtn) {
      newChatBtn.click();
    }
  }
  if (ctrlKey && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (searchBar) {
      searchBar.focus();
    }
  }
});

// Initialize with a new topic on page load
createNewTopic();
fetchHistory();
checkScrollButton();
