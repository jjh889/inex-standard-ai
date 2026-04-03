/**
 * AI Dev Standard Dashboard - Frontend v2.0
 * PLAN_REVIEW + 3-Agent + 시나리오 데모
 */

const socket = io();
let currentTaskId = null;
let tasksData = {};

// ============================================================
// Socket.IO
// ============================================================

socket.on('init', (tasks) => {
  tasks.forEach((t) => { tasksData[t.id] = t; });
  renderTaskList();
});

socket.on('stateChange', ({ taskId, oldState, newState, task }) => {
  tasksData[taskId] = task;
  renderTaskList();
  if (taskId === currentTaskId) {
    updatePipeline(newState);
    // 상태 변경 시 패널 자동 숨기기
    if (newState !== 'DONE') document.getElementById('approvalPanel').classList.add('hidden');
    if (newState !== 'PLAN_REVIEW') document.getElementById('planPanel').classList.add('hidden');
  }
});

socket.on('log', (entry) => {
  if (tasksData[entry.taskId]) {
    tasksData[entry.taskId].logs = tasksData[entry.taskId].logs || [];
    tasksData[entry.taskId].logs.push(entry);
  }
  if (entry.taskId === currentTaskId) appendLog(entry);
});

socket.on('claudeOutput', ({ taskId, output }) => {
  if (tasksData[taskId]) tasksData[taskId].claudeOutput = output;
  if (taskId === currentTaskId) {
    document.getElementById('claudeCode').textContent = output.code;
    animateCard('claudeCard');
  }
});

socket.on('codexOutput', ({ taskId, output }) => {
  if (tasksData[taskId]) tasksData[taskId].codexOutput = output;
  if (taskId === currentTaskId) {
    document.getElementById('codexResult').textContent =
      `Build: ${output.buildPassed ? '✅ PASS' : '❌ FAIL'}\nTests: ${output.testsPassed}/${output.testsPassed + output.testsFailed} passed\nCoverage: ${output.coverage}%\n\nDiff:\n${output.diff}`;
    animateCard('codexCard');
  }
});

socket.on('reviewResult', ({ taskId, result }) => {
  if (tasksData[taskId]) tasksData[taskId].reviewResult = result;
  if (taskId === currentTaskId) {
    const issues = result.issues.map((i) => `  [${i.severity}] ${i.description}`).join('\n');
    document.getElementById('reviewResult').textContent =
      `Verdict: ${result.verdict}\nIssues:\n${issues || '  없음'}\n\nSummary: ${result.summary}`;
    animateCard('reviewCard');
  }
});

socket.on('feedbackRouting', ({ taskId, from, to, reason, retryCount, escalated }) => {
  if (taskId === currentTaskId) {
    const el = document.getElementById('feedbackLoop');
    const text = document.getElementById('feedbackText');
    el.classList.remove('hidden');
    const icon = escalated ? '⚡ ESCALATION: ' : '↩ ';
    text.innerHTML = `${icon}<strong>${from}</strong> → <strong>${to}</strong> | ${reason} (${retryCount}/3)`;
    setTimeout(() => el.classList.add('hidden'), 6000);
  }
});

socket.on('awaitingApproval', ({ taskId, task, requiredApprovals }) => {
  tasksData[taskId] = task;
  if (taskId === currentTaskId) showApprovalPanel(task, requiredApprovals);
});

socket.on('awaitingPlan', ({ taskId, task, plan }) => {
  tasksData[taskId] = task;
  if (taskId === currentTaskId) showPlanPanel(task, plan);
});

socket.on('planGenerated', ({ taskId, plan }) => {
  if (tasksData[taskId]) tasksData[taskId].plan = plan;
});

// ============================================================
// Task List
// ============================================================

function renderTaskList() {
  const list = document.getElementById('taskList');
  const ids = Object.keys(tasksData);
  if (ids.length === 0) {
    list.innerHTML = '<div class="empty-state">위 시나리오를 선택하여 데모를 시작하세요</div>';
    return;
  }
  list.innerHTML = [...ids].reverse().map((id) => {
    const t = tasksData[id];
    const active = id === currentTaskId ? 'active' : '';
    const fin = t.tags?.includes('FINANCIAL') ? '<span class="tag-financial">FINANCIAL</span>' : '';
    return `<div class="task-item ${active}" onclick="selectTask('${id}')">
      <div class="task-id">${t.id} <span class="task-tag state-${t.state}">${t.state}</span> ${fin}</div>
      <div class="task-desc">${t.description}</div>
    </div>`;
  }).join('');
}

function selectTask(taskId) {
  currentTaskId = taskId;
  const task = tasksData[taskId];
  document.getElementById('pipelineTaskId').textContent = taskId;
  document.getElementById('pipelineTaskId').className = `task-tag state-${task.state}`;
  renderTaskList();
  updatePipeline(task.state);

  document.getElementById('claudeCode').textContent = task.claudeOutput ? task.claudeOutput.code : '대기 중...';
  document.getElementById('codexResult').textContent = task.codexOutput
    ? `Build: ${task.codexOutput.buildPassed ? '✅' : '❌'}\nTests: ${task.codexOutput.testsPassed}/${task.codexOutput.testsPassed + task.codexOutput.testsFailed}\nCoverage: ${task.codexOutput.coverage}%\n\nDiff:\n${task.codexOutput.diff}`
    : '대기 중...';
  document.getElementById('reviewResult').textContent = task.reviewResult
    ? `Verdict: ${task.reviewResult.verdict}\nSummary: ${task.reviewResult.summary}`
    : '대기 중...';

  // Panels
  document.getElementById('planPanel').classList.add('hidden');
  document.getElementById('approvalPanel').classList.add('hidden');
  document.getElementById('feedbackLoop').classList.add('hidden');

  if (task.state === 'PLAN_REVIEW' && task.plan && !task.planApproved) showPlanPanel(task, task.plan);
  if (task.state === 'DONE') showApprovalPanel(task, task.tags?.includes('FINANCIAL') ? 2 : 1);

  // Logs
  const logStream = document.getElementById('logStream');
  logStream.innerHTML = '';
  (task.logs || []).forEach((e) => appendLog(e, false));
}

function updatePipeline(currentState) {
  const stages = ['TODO', 'PLAN_REVIEW', 'DESIGN', 'CODEX_EXEC', 'CI_TEST', 'REVIEW', 'DONE', 'MERGED'];
  const currentIdx = stages.indexOf(currentState);
  const connectors = document.querySelectorAll('.pipeline-connector');

  stages.forEach((stage, i) => {
    const el = document.getElementById(`stage-${stage}`);
    if (!el) return;
    el.classList.remove('active', 'completed', 'failed');
    if (currentState === 'FAILED') {
      el.classList.add('failed');
    } else if (i < currentIdx) {
      el.classList.add('completed');
    } else if (i === currentIdx) {
      el.classList.add('active');
    }
  });

  connectors.forEach((c, i) => {
    c.classList.toggle('active', currentState !== 'FAILED' && i < currentIdx);
  });
}

// ============================================================
// Plan Review
// ============================================================

function showPlanPanel(task, plan) {
  const panel = document.getElementById('planPanel');
  const content = document.getElementById('planContent');
  const fin = task.tags?.includes('FINANCIAL');

  const stepsHtml = plan.steps.map((s) => {
    const agentColor = { Claude: 'agent-claude', Codex: 'agent-codex', Harness: 'agent-harness', Human: 'agent-human' }[s.agent] || '';
    return `<div class="plan-step">
      <div class="plan-step-num">${s.step}</div>
      <div>
        <span class="plan-step-agent agent-tag ${agentColor}">${s.agent}</span>
        <span class="plan-step-title">${s.title}</span>
        <div class="plan-step-detail">${s.detail}</div>
      </div>
    </div>`;
  }).join('');

  const risksHtml = plan.risks.map((r) => `<div class="plan-risk-item">• ${r}</div>`).join('');

  content.innerHTML = `
    <div style="margin-bottom:8px;color:var(--text-secondary)">
      <strong>${task.id}</strong> — ${task.description}
      ${fin ? '<span class="tag-financial" style="margin-left:6px">FINANCIAL</span>' : ''}
    </div>
    ${stepsHtml}
    <div class="plan-risks">
      <div class="plan-risks-title">⚠ 예상 리스크</div>
      ${risksHtml}
    </div>
    <div class="plan-retry">재시도 정책: ${plan.retryPolicy}</div>
  `;

  panel.classList.remove('hidden');
}

async function approvePlan() {
  if (!currentTaskId) return;
  await fetch(`/api/tasks/${currentTaskId}/plan/approve`, { method: 'POST' });
  document.getElementById('planPanel').classList.add('hidden');
}

async function rejectPlan() {
  if (!currentTaskId) return;
  await fetch(`/api/tasks/${currentTaskId}/plan/reject`, { method: 'POST' });
  document.getElementById('planPanel').classList.add('hidden');
}

// ============================================================
// Human Approval
// ============================================================

function showApprovalPanel(task, requiredApprovals) {
  const panel = document.getElementById('approvalPanel');
  const content = document.getElementById('approvalContent');
  const fin = task.tags?.includes('FINANCIAL');
  const approved = task.approvedCount || 0;

  content.innerHTML = `
    <div><span class="label">Task:</span> <span class="value">${task.id} - ${task.description}</span></div>
    ${fin ? '<div class="financial-warn">⚠️ [FINANCIAL] 금융 로직 — 2인 승인 필요</div>' : ''}
    ${task.reviewResult ? `<div><span class="label">리뷰:</span> <span class="value">${task.reviewResult.verdict} — ${task.reviewResult.summary}</span></div>` : ''}
    <div><span class="label">승인:</span> <span class="value">${approved}/${requiredApprovals}</span></div>
  `;
  panel.classList.remove('hidden');
}

async function approveTask() {
  if (!currentTaskId) return;
  const res = await fetch(`/api/tasks/${currentTaskId}/approve`, { method: 'POST' });
  const task = await res.json();
  tasksData[task.id] = task;
  if (task.state === 'MERGED') {
    document.getElementById('approvalPanel').classList.add('hidden');
  } else {
    showApprovalPanel(task, task.tags?.includes('FINANCIAL') ? 2 : 1);
  }
}

async function rejectTask() {
  if (!currentTaskId) return;
  await fetch(`/api/tasks/${currentTaskId}/reject`, { method: 'POST' });
  document.getElementById('approvalPanel').classList.add('hidden');
}

// ============================================================
// Log Stream
// ============================================================

function appendLog(entry, scroll = true) {
  const logStream = document.getElementById('logStream');
  const time = new Date(entry.timestamp).toLocaleTimeString('ko-KR');
  const div = document.createElement('div');
  div.className = `log-entry ${entry.level || ''}`;
  div.innerHTML = `<span class="time">${time}</span> <span class="agent-tag agent-${entry.agent}">${entry.agent}</span> <span class="event">${entry.event}</span>${entry.detail ? ` <span class="detail">${entry.detail}</span>` : ''}`;
  logStream.appendChild(div);
  if (scroll) logStream.scrollTop = logStream.scrollHeight;
}

function clearLogs() { document.getElementById('logStream').innerHTML = ''; }

// ============================================================
// Modal
// ============================================================

function openNewTaskModal() { document.getElementById('newTaskModal').classList.remove('hidden'); document.getElementById('taskDesc').focus(); }
function closeModal() { document.getElementById('newTaskModal').classList.add('hidden'); }
function setPreset(d, f) { document.getElementById('taskDesc').value = d; document.getElementById('taskFinancial').checked = f; }

async function submitTask() {
  const desc = document.getElementById('taskDesc').value.trim();
  if (!desc) return;
  const tags = document.getElementById('taskFinancial').checked ? ['FINANCIAL'] : [];
  const res = await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description: desc, tags }) });
  const task = await res.json();
  tasksData[task.id] = task;
  renderTaskList();
  selectTask(task.id);
  closeModal();
  document.getElementById('taskDesc').value = '';
  document.getElementById('taskFinancial').checked = false;
}

function animateCard(cardId) {
  const el = document.getElementById(cardId);
  el.style.borderColor = 'var(--accent-blue)';
  el.style.boxShadow = '0 0 15px rgba(88, 166, 255, 0.3)';
  setTimeout(() => { el.style.borderColor = ''; el.style.boxShadow = ''; }, 1500);
}

// ============================================================
// Scenario Launcher + URL 자동 실행
// ============================================================

async function loadScenarios() {
  const res = await fetch('/api/scenarios');
  const scenarios = await res.json();
  const container = document.getElementById('scenarioButtons');
  container.innerHTML = scenarios.map((s) => {
    const tags = s.tags.map((t) => `<span class="tag-financial">${t}</span>`).join('');
    return `<button class="scenario-btn" onclick="runScenario('${s.key}')" title="${s.summary}">
      <span class="sc-icon">${s.icon}</span>
      <div><div class="sc-name">${s.name}</div><div class="sc-tags">${tags}</div></div>
    </button>`;
  }).join('');
}

async function runScenario(key) {
  const res = await fetch(`/api/scenarios/${key}/run`, { method: 'POST' });
  const task = await res.json();
  tasksData[task.id] = task;
  renderTaskList();
  selectTask(task.id);
}

// URL 파라미터로 시나리오 자동 실행
async function checkUrlScenario() {
  const params = new URLSearchParams(window.location.search);
  const scenario = params.get('scenario');
  if (scenario) {
    // URL 파라미터 제거 (새로고침 시 중복 실행 방지)
    window.history.replaceState({}, '', window.location.pathname);
    await runScenario(scenario);
  }
}

// Init
loadScenarios();
setTimeout(checkUrlScenario, 500);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
  if (e.key === 'Enter' && !document.getElementById('newTaskModal').classList.contains('hidden')) submitTask();
});
