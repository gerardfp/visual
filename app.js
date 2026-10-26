/**
 * Controlador principal de la interfaz de PyVisual
 */

(function () {
  const algoSelect = document.getElementById('algo-select');
  const btnRandomInput = document.getElementById('btn-random-input');
  const btnResetCode = document.getElementById('btn-reset-code');
  const btnSubsetHelp = document.getElementById('btn-subset-help');
  const btnThemeToggle = document.getElementById('btn-theme-toggle');
  const subsetDialog = document.getElementById('subset-dialog');
  const btnCloseDialog = document.getElementById('btn-close-dialog');

  const btnFirst = document.getElementById('btn-first');
  const btnPrev = document.getElementById('btn-prev');
  const btnPlay = document.getElementById('btn-play');
  const btnNext = document.getElementById('btn-next');
  const btnStepOver = document.getElementById('btn-step-over');
  const btnStepOut = document.getElementById('btn-step-out');
  const btnLast = document.getElementById('btn-last');
  const stepCounter = document.getElementById('step-counter');
  const stepSlider = document.getElementById('step-slider');
  const speedSelect = document.getElementById('speed-select');

  const algoCategoryBadge = document.getElementById('algo-category-badge');
  const algoTitle = document.getElementById('algo-title');
  const algoComplexity = document.getElementById('algo-complexity');
  const algoSummary = document.getElementById('algo-summary');

  const btnRunCode = document.getElementById('btn-run-code');
  const stepLinePill = document.getElementById('step-line-pill');
  const stepEventDesc = document.getElementById('step-event-desc');
  const errorBanner = document.getElementById('error-banner');

  const editorScroller = document.getElementById('code-editor-scroller');
  const lineGutter = document.getElementById('line-gutter');
  const codeBackdrop = document.getElementById('code-backdrop');
  const codeTextarea = document.getElementById('code-textarea');

  const vizContainers = {
    stageEl: document.getElementById('viz-stage'),
    callStackEl: document.getElementById('call-stack-container'),
    varsTableEl: document.getElementById('vars-table-container'),
    consoleEl: document.getElementById('console-container')
  };

  let currentExample = null;
  let steps = [];
  let currentStepIdx = 0;
  let playTimer = null;
  const breakpoints = new Set();

  // --- Inicializar Selector de Algoritmos ---
  function populateSelector() {
    const groups = new Map();
    for (const ex of window.ALGORITHM_EXAMPLES) {
      if (!groups.has(ex.category)) {
        groups.set(ex.category, []);
      }
      groups.get(ex.category).push(ex);
    }

    algoSelect.innerHTML = '';
    for (const [category, items] of groups.entries()) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = category;
      for (const item of items) {
        const opt = document.createElement('option');
        opt.value = item.id;
        opt.textContent = item.title;
        optgroup.appendChild(opt);
      }
      algoSelect.appendChild(optgroup);
    }
  }

  function loadAlgorithmById(id) {
    stopPlayback();
    breakpoints.clear();
    const found = window.ALGORITHM_EXAMPLES.find((x) => x.id === id) || window.ALGORITHM_EXAMPLES[0];
    currentExample = found;
    algoSelect.value = found.id;

    algoCategoryBadge.textContent = found.category;
    algoTitle.textContent = found.title;
    algoComplexity.textContent = found.complexity;
    algoSummary.textContent = found.summary;

    codeTextarea.value = found.code;
    syncEditorDimensions();
    compileAndRun(0);
  }

  function syncEditorDimensions() {
    const lines = codeTextarea.value.split('\n');
    const lineCount = lines.length;
    const heightPx = Math.max(400, lineCount * 24 + 28);
    codeTextarea.style.height = `${heightPx}px`;
    codeBackdrop.style.height = `${heightPx}px`;
    renderGutterAndBackdrop(lineCount, getCurrentLine());
  }

  function getCurrentLine() {
    if (steps.length === 0 || !steps[currentStepIdx]) return null;
    return steps[currentStepIdx].line;
  }

  function renderGutterAndBackdrop(lineCount, activeLine) {
    let gutterHtml = '';
    let backdropHtml = '';

    for (let i = 1; i <= lineCount; i++) {
      const isCurrent = i === activeLine;
      const hasBp = breakpoints.has(i);
      gutterHtml += `
        <div class="gutter-line ${isCurrent ? 'gutter-active' : ''} ${hasBp ? 'has-breakpoint' : ''}" data-line="${i}" title="Clic para activar/desactivar breakpoint en línea ${i}">
          <span class="bp-dot"></span>
          <span>${i}</span>
        </div>
      `;
      backdropHtml += `<div class="backdrop-line ${isCurrent ? 'line-current' : ''}"></div>`;
    }

    lineGutter.innerHTML = gutterHtml;
    codeBackdrop.innerHTML = backdropHtml;
  }

  function scrollActiveLineIntoView(line) {
    if (!line) return;
    const targetY = (line - 1) * 24;
    const viewTop = editorScroller.scrollTop;
    const viewHeight = editorScroller.clientHeight;
    if (targetY < viewTop + 24 || targetY > viewTop + viewHeight - 48) {
      editorScroller.scrollTo({
        top: Math.max(0, targetY - viewHeight / 2),
        behavior: 'smooth'
      });
    }
  }

  // --- Ejecución del Intérprete del Subset de Python ---
  function compileAndRun(targetStep = 0) {
    stopPlayback();
    errorBanner.hidden = true;
    errorBanner.textContent = '';

    const source = codeTextarea.value;
    syncEditorDimensions();

    try {
      const interpreter = new window.PySubset.Interpreter(5000);
      const result = interpreter.run(source);
      steps = result.steps;

      if (steps.length === 0) {
        stepSlider.max = 0;
        stepSlider.value = 0;
        stepCounter.textContent = 'Paso 0 / 0';
        stepLinePill.textContent = 'Sin pasos';
        stepEventDesc.textContent = 'El código no produjo pasos ejecutables.';
        window.PyVisualizer.renderStepVisualization(null, vizContainers);
        updateTransportButtons();
        return;
      }

      stepSlider.max = steps.length - 1;
      goToStep(Math.min(targetStep, steps.length - 1));
    } catch (err) {
      errorBanner.hidden = false;
      errorBanner.textContent = `❌ ${err.message}`;
      if (err.line) {
        renderGutterAndBackdrop(codeTextarea.value.split('\n').length, err.line);
      }
    }
  }

  function goToStep(idx) {
    if (steps.length === 0) return;
    currentStepIdx = Math.max(0, Math.min(idx, steps.length - 1));
    const step = steps[currentStepIdx];

    stepSlider.value = currentStepIdx;
    stepCounter.textContent = `Paso ${currentStepIdx + 1} / ${steps.length}`;
    stepLinePill.textContent = `Línea ${step.line}`;
    stepEventDesc.textContent = step.description || 'Ejecutando instrucción';

    const lineCount = codeTextarea.value.split('\n').length;
    renderGutterAndBackdrop(lineCount, step.line);
    scrollActiveLineIntoView(step.line);

    window.PyVisualizer.renderStepVisualization(step, vizContainers);
    updateTransportButtons();
  }

  function updateTransportButtons() {
    const hasSteps = steps.length > 0;
    const atStart = !hasSteps || currentStepIdx <= 0;
    const atEnd = !hasSteps || currentStepIdx >= steps.length - 1;

    btnFirst.disabled = atStart;
    btnPrev.disabled = atStart;
    btnNext.disabled = atEnd;
    btnStepOver.disabled = atEnd;
    btnStepOut.disabled = atEnd;
    btnLast.disabled = atEnd;
    btnPlay.disabled = !hasSteps;
  }

  // --- Reproducción Automática (Play / Pause) ---
  function startPlayback() {
    if (steps.length === 0) return;
    if (currentStepIdx >= steps.length - 1) {
      goToStep(0);
    }
    btnPlay.textContent = '⏸ Pausar';
    const intervalMs = Number(speedSelect.value) || 650;

    playTimer = setInterval(() => {
      if (currentStepIdx < steps.length - 1) {
        goToStep(currentStepIdx + 1);
        const curLine = steps[currentStepIdx].line;
        if (breakpoints.has(curLine)) {
          stopPlayback();
          stepEventDesc.textContent = `🔴 Pausado en Breakpoint (Línea ${curLine}) — ${steps[currentStepIdx].description}`;
        }
      } else {
        stopPlayback();
      }
    }, intervalMs);
  }

  function stopPlayback() {
    if (playTimer) {
      clearInterval(playTimer);
      playTimer = null;
    }
    btnPlay.textContent = '▶ Reproducir';
  }

  function togglePlayback() {
    if (playTimer) {
      stopPlayback();
    } else {
      startPlayback();
    }
  }

  // --- Step Over & Step Out ---
  function stepOver() {
    if (currentStepIdx >= steps.length - 1) return;
    const curDepth = steps[currentStepIdx].frames.length;
    let nextIdx = currentStepIdx + 1;
    while (nextIdx < steps.length - 1 && steps[nextIdx].frames.length > curDepth) {
      nextIdx++;
    }
    goToStep(nextIdx);
  }

  function stepOut() {
    if (currentStepIdx >= steps.length - 1) return;
    const curDepth = steps[currentStepIdx].frames.length;
    if (curDepth <= 1) {
      goToStep(currentStepIdx + 1);
      return;
    }
    let nextIdx = currentStepIdx + 1;
    while (nextIdx < steps.length - 1 && steps[nextIdx].frames.length >= curDepth) {
      nextIdx++;
    }
    goToStep(nextIdx);
  }

  // --- Generador de Datos Aleatorios para Experimentar ---
  function randomizeInput() {
    let code = codeTextarea.value;

    // Si es counting_sort usamos enteros pequeños [0..9]
    if (currentExample && currentExample.id === 'counting_sort') {
      const arr = Array.from({ length: 7 }, () => Math.floor(Math.random() * 9) + 1);
      code = code.replace(/a\s*=\s*\[[^\]]+\]/, `a = [${arr.join(', ')}]`);
    } else if (currentExample && currentExample.id === 'radix_sort') {
      const arr = Array.from({ length: 7 }, () => Math.floor(Math.random() * 400) + 2);
      code = code.replace(/a\s*=\s*\[[^\]]+\]/, `a = [${arr.join(', ')}]`);
    } else if (currentExample && currentExample.id === 'binary_search') {
      const set = new Set();
      while (set.size < 7) set.add(Math.floor(Math.random() * 25) + 1);
      const sorted = Array.from(set).sort((a, b) => a - b);
      const pick = sorted[Math.floor(Math.random() * sorted.length)];
      code = code.replace(/nums\s*=\s*\[[^\]]+\]/, `nums = [${sorted.join(', ')}]`);
      code = code.replace(/binary_search\(nums,\s*\d+\)/, `binary_search(nums, ${pick})`);
    } else if (currentExample && currentExample.id === 'bst') {
      const set = new Set();
      while (set.size < 8) set.add(Math.floor(Math.random() * 25) + 1);
      const arr = Array.from(set);
      code = code.replace(/for key in \[[^\]]+\]:/, `for key in [${arr.join(', ')}]:`);
    } else if (/a\s*=\s*\[[^\]]+\]/.test(code)) {
      const arr = Array.from({ length: 6 }, () => Math.floor(Math.random() * 45) + 1);
      code = code.replace(/a\s*=\s*\[[^\]]+\]/, `a = [${arr.join(', ')}]`);
    } else if (/for value in \[[^\]]+\]:/.test(code)) {
      const arr = Array.from({ length: 4 }, () => Math.floor(Math.random() * 20) + 1);
      code = code.replace(/for value in \[[^\]]+\]:/, `for value in [${arr.join(', ')}]:`);
    } else if (/fib\(\d+\)/.test(code)) {
      const n = Math.floor(Math.random() * 3) + 3; // 3..5
      code = code.replace(/fib\(\d+\)/g, `fib(${n})`);
    }

    codeTextarea.value = code;
    compileAndRun(0);
  }

  // --- Eventos ---
  algoSelect.addEventListener('change', () => {
    loadAlgorithmById(algoSelect.value);
  });

  btnRandomInput.addEventListener('click', randomizeInput);

  btnResetCode.addEventListener('click', () => {
    if (currentExample) {
      loadAlgorithmById(currentExample.id);
    }
  });

  btnRunCode.addEventListener('click', () => {
    compileAndRun(0);
  });

  btnFirst.addEventListener('click', () => {
    stopPlayback();
    goToStep(0);
  });

  btnPrev.addEventListener('click', () => {
    stopPlayback();
    goToStep(currentStepIdx - 1);
  });

  btnPlay.addEventListener('click', togglePlayback);

  btnNext.addEventListener('click', () => {
    stopPlayback();
    goToStep(currentStepIdx + 1);
  });

  btnStepOver.addEventListener('click', () => {
    stopPlayback();
    stepOver();
  });

  btnStepOut.addEventListener('click', () => {
    stopPlayback();
    stepOut();
  });

  btnLast.addEventListener('click', () => {
    stopPlayback();
    goToStep(steps.length - 1);
  });

  stepSlider.addEventListener('input', () => {
    stopPlayback();
    goToStep(Number(stepSlider.value));
  });

  speedSelect.addEventListener('change', () => {
    if (playTimer) {
      stopPlayback();
      startPlayback();
    }
  });

  // Breakpoints al hacer clic en el número de línea
  lineGutter.addEventListener('click', (e) => {
    const lineEl = e.target.closest('.gutter-line');
    if (!lineEl) return;
    const lineNum = Number(lineEl.dataset.line);
    if (breakpoints.has(lineNum)) {
      breakpoints.delete(lineNum);
    } else {
      breakpoints.add(lineNum);
    }
    renderGutterAndBackdrop(codeTextarea.value.split('\n').length, getCurrentLine());
  });

  // Soporte de Tab en el editor de código
  codeTextarea.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = codeTextarea.selectionStart;
      const end = codeTextarea.selectionEnd;
      const val = codeTextarea.value;
      codeTextarea.value = val.slice(0, start) + '    ' + val.slice(end);
      codeTextarea.selectionStart = codeTextarea.selectionEnd = start + 4;
      syncEditorDimensions();
    }
  });

  codeTextarea.addEventListener('input', () => {
    syncEditorDimensions();
  });

  // Atajos de teclado globales (cuando el foco no está escribiendo en el textarea)
  window.addEventListener('keydown', (e) => {
    if (document.activeElement === codeTextarea || subsetDialog.open) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      stopPlayback();
      goToStep(currentStepIdx + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      stopPlayback();
      goToStep(currentStepIdx - 1);
    } else if (e.key === ' ') {
      e.preventDefault();
      togglePlayback();
    }
  });

  // Modal <dialog> Subset de Python
  btnSubsetHelp.addEventListener('click', () => {
    subsetDialog.showModal();
  });

  btnCloseDialog.addEventListener('click', () => {
    subsetDialog.close();
  });

  subsetDialog.addEventListener('click', (e) => {
    if (e.target === subsetDialog) {
      subsetDialog.close();
    }
  });

  // Cambio de tema Claro / Oscuro
  btnThemeToggle.addEventListener('click', () => {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isCurrentlyDark = current === 'dark' || (!current && prefersDark);
    html.setAttribute('data-theme', isCurrentlyDark ? 'light' : 'dark');
  });

  // Inicializar aplicación
  populateSelector();
  loadAlgorithmById(window.ALGORITHM_EXAMPLES[0].id);
})();
