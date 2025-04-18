document.addEventListener('DOMContentLoaded', () => {
  // --- State ---
  let state = {
      physicalMemory: [], // Array representing frames (null if free, object if occupied)
      pageTable: {},      // Map: pageNum -> { frame: num|null, present: bool, referenced: bool, modified: bool }
      referenceString: [],// Array of page numbers to access
      currentIndex: 0,    // Index in referenceString being processed
      pageFaults: 0,
      hits: 0,
      algorithm: 'FIFO',  // Current replacement algorithm
      memorySize: 8,      // Number of frames
      fifoQueue: [],      // For FIFO algorithm
      lruStack: [],       // For LRU algorithm (most recent at front)
      intervalId: null,   // For auto-run timer
      speed: 1000,        // Simulation step duration (ms)
      isPaused: false,
      isFinished: false,
      tutorialStep: 0,
      chartInstance: null // Chart.js instance
  };

  // --- DOM Elements ---
  const elements = {
      memorySize: document.getElementById('memory-size'),
      // pageSize: document.getElementById('page-size'), // Removed as it was non-functional
      algorithm: document.getElementById('algorithm'),
      referenceType: document.getElementById('reference-type'),
      refLength: document.getElementById('ref-length'),
      manualRef: document.getElementById('manual-ref'),
      randomRefGroup: document.getElementById('random-ref-group'),
      manualRefGroup: document.getElementById('manual-ref-group'),
      generateBtn: document.getElementById('generate-btn'),
      resetBtn: document.getElementById('reset-btn'),
      startBtn: document.getElementById('start-btn'),
      stepBtn: document.getElementById('step-btn'),
      pauseBtn: document.getElementById('pause-btn'),
      referenceStringDisplay: document.getElementById('reference-string-display'),
      memoryGrid: document.getElementById('memory-grid'),
      currentReference: document.getElementById('current-reference'),
      algorithmVis: document.getElementById('algorithm-vis'),
      pageTableBody: document.getElementById('page-table-body'),
      pageFaults: document.getElementById('page-faults'),
      hitRatio: document.getElementById('hit-ratio'),
      statsChartCtx: document.getElementById('stats-chart')?.getContext('2d'),
      statusMessage: document.getElementById('status-message'),
      startTutorial: document.getElementById('start-tutorial'),
      tutorialStepsContainer: document.getElementById('tutorial-steps'),
      tutorialWelcome: document.getElementById('tutorial-welcome'),
      tabButtons: document.querySelectorAll('.tab-button'),
      tabContents: document.querySelectorAll('.tab-content'),
      speedBtns: document.querySelectorAll('.speed-btn'),
      algoInfoBoxes: document.querySelectorAll('.algorithm-info'),
      algoInfoTextSpans: document.querySelectorAll('.algorithm-info .info-text') // Target spans inside info boxes
  };

  // --- Tutorial Content ---
  const tutorialContent = [
      { title: "Step 1: Frames & Algorithms", content: "Physical memory is shown as 'Frames'. Choose how many frames are available and select a 'Page Replacement Algorithm' (like FIFO or LRU)." },
      { title: "Step 2: Reference String", content: "This is the sequence of page accesses. 'Generate Random' or 'Enter Manually' (e.g., 1,2,3,1,4). Click 'Generate String'." },
      { title: "Step 3: Run Simulation", content: "Click 'Start' for auto-run, 'Step' for one access at a time. Use speed buttons. Watch the 'Memory Frames' change color." },
      { title: "Step 4: Observe Frames", content: "Gray frames are free. Blue frames hold a page. A pulsing red frame indicates a 'Page Fault' - the page is being loaded." },
      { title: "Step 5: Page Table & Stats", content: "Check the 'Page Table' tab to see where pages are located (or if they are 'Present'). Analyze 'Page Faults' and 'Hit Ratio' on the left, and the chart in the 'Statistics' tab." },
      { title: "Step 6: Experiment!", content: "Try different frame counts, algorithms, and reference strings. Use 'Reset Sim' to start over. See how settings affect performance (lower faults are better!)." }
  ];

  // --- Initialization ---
  function init() {
      setupEventListeners();
      state.memorySize = parseInt(elements.memorySize.value, 10);
      state.algorithm = elements.algorithm.value;
      // Generate an initial random string on load for immediate interaction
      generateReferenceString(false); // Don't reset yet
      resetSimulation(false); // Now reset based on initial values, keep string
      updateAlgorithmInfo();
      highlightSpeedButton(state.speed);
      updateStatus("Simulator ready. Adjust settings or click Start/Step.");
      // Initialize Lucide icons
      lucide.createIcons();
      // Render initial empty chart
      if (elements.statsChartCtx) renderStatsChart();
  }

  // --- Event Listeners ---
  function setupEventListeners() {
      elements.memorySize.addEventListener('change', handleMemorySizeChange);
      elements.algorithm.addEventListener('change', handleAlgorithmChange);
      elements.referenceType.addEventListener('change', toggleReferenceInput);
      elements.generateBtn.addEventListener('click', () => generateReferenceString(true));
      elements.resetBtn.addEventListener('click', () => resetSimulation(true)); // Clear reference string on manual reset
      elements.startBtn.addEventListener('click', startSimulation);
      elements.stepBtn.addEventListener('click', stepSimulation);
      elements.pauseBtn.addEventListener('click', pauseSimulation);

      elements.tabButtons.forEach(button => {
          button.addEventListener('click', () => switchTab(button.getAttribute('data-tab')));
      });

      elements.speedBtns.forEach(button => {
          button.addEventListener('click', handleSpeedChange);
      });

      elements.startTutorial.addEventListener('click', startTutorial);
  }

  // --- Event Handlers ---
  function handleMemorySizeChange() {
      state.memorySize = parseInt(elements.memorySize.value, 10);
      resetSimulation(false); // Keep current reference string if exists
      updateStatus(`Memory size set to ${state.memorySize} frames. Simulation reset.`);
      lucide.createIcons(); // Re-create icons if needed (e.g., if elements were rebuilt)
  }

  function handleAlgorithmChange() {
      state.algorithm = elements.algorithm.value;
      updateAlgorithmInfo();
      // Resetting on algorithm change provides a clean slate for comparison
      resetSimulation(false); // Keep current reference string
      updateStatus(`Algorithm changed to ${state.algorithm}. Simulation reset.`);
      lucide.createIcons(); // Re-create icons
  }

  function handleSpeedChange() {
      const newSpeed = parseInt(this.getAttribute('data-speed'), 10);
      if (newSpeed === state.speed) return; // No change

      state.speed = newSpeed;
      highlightSpeedButton(state.speed);
      updateStatus(`Simulation speed set to ${state.speed}ms.`);

      // If simulation is running automatically, clear and restart interval with new speed
      if (state.intervalId && !state.isPaused) {
          clearInterval(state.intervalId);
          // Don't run a step immediately, just restart the timer
          state.intervalId = setInterval(runStep, state.speed);
      }
  }

  // --- Tutorial Logic ---
  function startTutorial() {
      elements.tutorialWelcome.classList.add('hidden');
      elements.tutorialStepsContainer.classList.remove('hidden');
      state.tutorialStep = 1;
      renderTutorialStep();
  }

  function renderTutorialStep() {
      if (state.tutorialStep < 1 || state.tutorialStep > tutorialContent.length) {
          endTutorial();
          return;
      }

      const stepData = tutorialContent[state.tutorialStep - 1];
      elements.tutorialStepsContainer.innerHTML = `
          <h4 class="font-semibold text-sm text-slate-700 mb-1">${stepData.title}</h4>
          <p class="text-xs text-slate-600 mb-2">${stepData.content}</p>
          <div class="flex justify-between items-center mt-3">
              <button class="tutorial-prev text-xs bg-slate-300 hover:bg-slate-400 text-slate-800 py-1 px-2 rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1" ${state.tutorialStep === 1 ? 'disabled' : ''}>
                  <i data-lucide="arrow-left" class="w-3 h-3"></i> Prev
              </button>
              <span class="text-xs text-slate-500">${state.tutorialStep} / ${tutorialContent.length}</span>
              <button class="tutorial-next text-xs bg-primary-500 hover:bg-primary-600 text-white py-1 px-2 rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1">
                  ${state.tutorialStep === tutorialContent.length ? 'Finish' : 'Next'} <i data-lucide="${state.tutorialStep === tutorialContent.length ? 'check' : 'arrow-right'}" class="w-3 h-3"></i>
              </button>
          </div>
      `;

      const prevBtn = elements.tutorialStepsContainer.querySelector('.tutorial-prev');
      const nextBtn = elements.tutorialStepsContainer.querySelector('.tutorial-next');

      if (prevBtn) prevBtn.addEventListener('click', prevTutorialStep);
      if (nextBtn) nextBtn.addEventListener('click', nextTutorialStep);

      lucide.createIcons(); // Create icons for the new buttons
  }

  function nextTutorialStep() {
      if (state.tutorialStep < tutorialContent.length) {
          state.tutorialStep++;
          renderTutorialStep();
      } else {
          endTutorial();
      }
  }

  function prevTutorialStep() {
      if (state.tutorialStep > 1) {
          state.tutorialStep--;
          renderTutorialStep();
      }
  }

  function endTutorial() {
      elements.tutorialStepsContainer.classList.add('hidden');
      elements.tutorialStepsContainer.innerHTML = ''; // Clear content
      elements.tutorialWelcome.classList.remove('hidden');
      state.tutorialStep = 0;
  }

  // --- UI Update Functions ---
  function updateStatus(message, type = 'info') {
      elements.statusMessage.textContent = message;
      // Optional: Add styling based on type (e.g., error, success)
      // elements.statusMessage.className = `text-xs mt-1 text-${type}-700`;
  }

  function switchTab(tabId) {
      elements.tabButtons.forEach(button => {
          const isTarget = button.getAttribute('data-tab') === tabId;
          button.classList.toggle('active', isTarget);
          button.classList.toggle('border-primary-500', isTarget);
          button.classList.toggle('text-primary-600', isTarget);
          button.classList.toggle('border-transparent', !isTarget);
          button.classList.toggle('text-slate-500', !isTarget);
          button.classList.toggle('hover:text-slate-700', !isTarget);
          button.classList.toggle('hover:border-slate-300', !isTarget);
      });
      elements.tabContents.forEach(content => {
          content.classList.toggle('hidden', content.id !== `${tabId}-tab`);
          content.classList.toggle('active', content.id === `${tabId}-tab`);
      });

      // Re-render chart if stats tab is activated and context exists
      if (tabId === 'stats' && elements.statsChartCtx) {
          renderStatsChart();
      }
      lucide.createIcons(); // Ensure icons in the newly visible tab are rendered
  }

  function toggleReferenceInput() {
      const isRandom = elements.referenceType.value === 'random';
      elements.randomRefGroup.classList.toggle('hidden', !isRandom);
      elements.manualRefGroup.classList.toggle('hidden', isRandom);
  }

  function highlightSpeedButton(speed) {
      elements.speedBtns.forEach(btn => {
          const btnSpeed = parseInt(btn.getAttribute('data-speed'), 10);
          const isActive = btnSpeed === speed;
          btn.classList.toggle('bg-primary-500', isActive);
          btn.classList.toggle('text-white', isActive);
          btn.classList.toggle('bg-slate-200', !isActive);
          // btn.classList.toggle('text-slate-700', !isActive); // Handled by Tailwind default/hover
      });
  }

  function updateAlgorithmInfo() {
      const selectedAlgo = state.algorithm;
      let infoText = '';
      switch(selectedAlgo) {
          case 'FIFO': infoText = 'Replaces the page that has been in memory the longest (oldest). Simple but can be inefficient.'; break;
          case 'LRU': infoText = 'Replaces the page that hasn\'t been used for the longest time. Generally good performance.'; break;
          case 'OPT': infoText = 'Replaces the page that won\'t be needed for the longest time in the future. Optimal but theoretical.'; break;
      }

      elements.algoInfoBoxes.forEach((box, index) => {
          const boxAlgo = box.id.split('-').pop(); // Assumes id like algorithm-info-FIFO
          const isSelected = boxAlgo === selectedAlgo;
          box.classList.toggle('hidden', !isSelected);
          if (isSelected) {
               // Find the specific span within this box to update its text
              const textSpan = box.querySelector('.info-text');
              if (textSpan) {
                  textSpan.textContent = infoText;
              }
          }
      });
       lucide.createIcons(); // Make sure icons in info boxes render
  }

  function updateControlStates() {
       const canStart = state.referenceString.length > 0 && !state.isFinished;
       const isRunning = state.intervalId !== null && !state.isPaused;

       elements.startBtn.disabled = !canStart || isRunning;
       elements.stepBtn.disabled = !canStart || isRunning;
       elements.pauseBtn.disabled = !isRunning; // Only enable pause when running

       elements.startBtn.classList.toggle('hidden', isRunning);
       elements.stepBtn.classList.toggle('hidden', isRunning); // Hide step when running automatically
       elements.pauseBtn.classList.toggle('hidden', !isRunning);

       // Adjust start button text
       if (state.isFinished) {
           elements.startBtn.innerHTML = '<i data-lucide="rotate-cw" class="w-4 h-4"></i> Restart Run';
           elements.startBtn.disabled = false; // Allow restarting
           elements.stepBtn.disabled = true;
       } else if (state.isPaused) {
           elements.startBtn.innerHTML = '<i data-lucide="play" class="w-4 h-4"></i> Continue';
       } else {
           elements.startBtn.innerHTML = '<i data-lucide="play" class="w-4 h-4"></i> Start';
       }

      // Disable config changes while running? Optional, can make UX simpler.
      // elements.memorySize.disabled = isRunning || state.isPaused;
      // elements.algorithm.disabled = isRunning || state.isPaused;
      // elements.generateBtn.disabled = isRunning || state.isPaused;

      lucide.createIcons(); // Update icons in buttons
  }

  // --- Simulation Logic ---
  function generateReferenceString(reset = true) {
      // Stop simulation if running
      if (state.intervalId) {
          clearInterval(state.intervalId);
          state.intervalId = null;
      }

      if (elements.referenceType.value === 'random') {
          const length = Math.max(5, Math.min(50, parseInt(elements.refLength.value, 10) || 20));
           elements.refLength.value = length; // Update input field in case of invalid input
          // Generate pages typically within a range related to memory size + some locality
          const uniquePages = Math.max(4, Math.min(25, state.memorySize + 5)); // More realistic range
          state.referenceString = Array.from({ length }, () => Math.floor(Math.random() * uniquePages) + 1);
      } else {
          const manualInput = elements.manualRef.value.trim();
          if (manualInput) {
              state.referenceString = manualInput.split(',')
                  .map(num => parseInt(num.trim(), 10))
                  .filter(num => !isNaN(num) && num > 0); // Ensure valid positive integers
          } else {
              state.referenceString = []; // Clear if input is empty
          }
           elements.manualRef.value = state.referenceString.join(', '); // Clean up input field
      }

      renderReferenceString();
      if (reset) {
          resetSimulation(false); // Reset state but keep the new string
      }
      updateStatus(`Reference string generated (${state.referenceString.length} pages). Ready.`);
      updateControlStates();
  }

  function renderReferenceString() {
      elements.referenceStringDisplay.innerHTML = ''; // Clear previous
      if (state.referenceString.length === 0) {
           elements.referenceStringDisplay.innerHTML = '<span class="text-xs text-slate-400 italic p-1">No reference string.</span>';
           return;
      }
      state.referenceString.forEach((page, index) => {
          const pageElement = document.createElement('div');
          pageElement.className = 'reference-page text-xs bg-slate-100 border border-slate-300 text-slate-700 px-1.5 py-0.5 rounded-md transition-all duration-200 ease-in-out inline-block relative';
          pageElement.textContent = page;
          pageElement.dataset.index = index; // Store index for highlighting
          elements.referenceStringDisplay.appendChild(pageElement);
      });
      // Highlight the initial (0th) element if simulation hasn't started
      if (state.currentIndex === 0 && state.referenceString.length > 0) {
          highlightReferenceStringItem(0);
      }
  }

   function highlightReferenceStringItem(index) {
       const items = elements.referenceStringDisplay.querySelectorAll('.reference-page');
       items.forEach((item, idx) => {
           item.classList.remove('current-ref', 'past-ref');
           if (idx < index) {
               item.classList.add('past-ref');
           } else if (idx === index) {
               item.classList.add('current-ref');
                // Scroll the container to make the current item visible if needed
                item.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
           }
       });
   }

  function resetSimulation(clearReference = true) {
      clearInterval(state.intervalId);
      state.intervalId = null;
      state.isPaused = false;
      state.isFinished = false;

      state.physicalMemory = Array(state.memorySize).fill(null);
      state.pageTable = {};
      state.currentIndex = 0;
      state.pageFaults = 0;
      state.hits = 0;
      state.fifoQueue = [];
      state.lruStack = [];

      if (clearReference) {
          state.referenceString = [];
          renderReferenceString();
           elements.manualRef.value = ''; // Clear manual input too
      } else {
           // If keeping the reference string, re-render it to reset highlights
          renderReferenceString();
      }

      elements.currentReference.classList.add('hidden');
      elements.currentReference.innerHTML = ''; // Clear content
      elements.algorithmVis.innerHTML = ''; // Clear visualization

      renderMemoryGrid();
      renderPageTable();
      updateStats();
      updateAlgorithmVisualization();
      if (elements.statsChartCtx) renderStatsChart(); // Reset chart

      updateStatus("Simulation reset. Configure and start.");
      updateControlStates();
  }

  function startSimulation() {
      if (state.referenceString.length === 0) {
          updateStatus("Generate a reference string first.", "warn");
          return;
      }

      // If finished, treat start as restart
      if (state.isFinished) {
          resetSimulation(false); // Reset state, keep string
          updateStatus("Restarting simulation run...");
      } else if (state.intervalId) {
          // Already running or paused -> trying to continue
           if (!state.isPaused) return; // Already running
           state.isPaused = false;
           updateStatus("Simulation continued...");
      } else {
          // Starting fresh or from beginning
           updateStatus("Simulation starting...");
      }

      state.isPaused = false;
      state.isFinished = false;
      elements.currentReference.classList.remove('hidden');

      // Clear any existing interval before starting a new one
      clearInterval(state.intervalId);

      // Run the first step immediately if not paused from middle
      if (state.currentIndex < state.referenceString.length && !state.isPaused) {
          runStep();
      }

      // Start interval only if not finished after the first step
      if (!state.isFinished) {
          state.intervalId = setInterval(runStep, state.speed);
      }

      updateControlStates();
  }

  function pauseSimulation() {
      if (!state.intervalId) return; // Not running

      clearInterval(state.intervalId);
      state.intervalId = null;
      state.isPaused = true;
      state.isFinished = false; // Not finished if paused manually

      updateStatus("Simulation paused.");
      updateControlStates();
  }

  function stepSimulation() {
      if (state.referenceString.length === 0) {
          updateStatus("Generate a reference string first.", "warn");
          return;
      }
      if (state.intervalId) return; // Don't step manually if auto-running

      // If finished, allow stepping to restart
       if (state.isFinished) {
           resetSimulation(false);
           updateStatus("Restarting simulation with step...");
       }

      state.isPaused = false; // Stepping implies not paused
      state.isFinished = false;
      elements.currentReference.classList.remove('hidden');

      runStep(); // Execute one step

      // Update status after step
      if (!state.isFinished) {
          updateStatus(`Processed page ${state.referenceString[state.currentIndex-1]}. Ready for next step.`);
      }
      updateControlStates();
  }

  function finishSimulation() {
      clearInterval(state.intervalId);
      state.intervalId = null;
      state.isPaused = false;
      state.isFinished = true;
      updateStatus("Simulation complete!");
      updateControlStates();
      // Maybe highlight the last item in reference string as final?
      if (state.referenceString.length > 0) {
          highlightReferenceStringItem(state.referenceString.length - 1);
      }
  }

  // Core simulation step logic
  function runStep() {
      if (state.currentIndex >= state.referenceString.length) {
          finishSimulation();
          return;
      }

      const page = state.referenceString[state.currentIndex];
      const pageInMemory = state.pageTable[page]?.present ?? false;

      highlightReferenceStringItem(state.currentIndex);

      let statusText = '';
      let isFault = false;

      if (pageInMemory) {
          handlePageHit(page);
          state.hits++;
          statusText = `<span class="font-semibold text-green-600">Hit <i data-lucide="check-circle-2" class="inline w-3 h-3"></i></span> (Page ${page} in memory)`;
          updateStatus(`Hit on page ${page}.`);
      } else {
          isFault = true;
          handlePageFault(page);
          state.pageFaults++;
          statusText = `<span class="font-semibold text-red-600">Fault <i data-lucide="alert-triangle" class="inline w-3 h-3"></i></span> (Page ${page} loading...)`;
          // Status updated within handlePageFault based on free frame / replacement
      }

      // Update current reference display
      elements.currentReference.innerHTML = `
          <h4 class="text-sm font-semibold mb-1">Step ${state.currentIndex + 1} / ${state.referenceString.length}</h4>
          <p class="text-xs">Accessing Page: <strong class="text-lg font-bold mx-1">${page}</strong> → ${statusText}</p>
      `;
      lucide.createIcons(); // Render icons in status text

      updateAlgorithmDataStructures(page, isFault);

      // Render updates immediately
      renderMemoryGrid();
      renderPageTable();
      updateStats();
      updateAlgorithmVisualization();
      if (elements.statsChartCtx && document.getElementById('stats-tab').classList.contains('active')) {
          renderStatsChart();
      }

      state.currentIndex++;

      // Check if finished after incrementing index
      if (state.currentIndex >= state.referenceString.length) {
          // If running automatically, finishSimulation will be called by the next interval check.
          // If stepping manually, finishSimulation is called in stepSimulation.
          // If this was the last step in an auto-run, the finishSimulation check at the start of this function handles it.
           // However, if finish happens *during* auto-run, need to clear interval here too.
          if (state.intervalId) {
              finishSimulation();
          }
      }
  }

  // --- Core Memory Management Logic ---
  function handlePageFault(page) {
      let frameIndex = -1;
      // Find first free frame (index where value is null)
      for(let i = 0; i < state.physicalMemory.length; i++) {
          if (state.physicalMemory[i] === null) {
              frameIndex = i;
              break;
          }
      }

      let evictedPage = null;

      if (frameIndex === -1) { // No free frame, need replacement
          frameIndex = selectFrameToReplace(page);
          if (frameIndex < 0 || frameIndex >= state.memorySize) {
               console.error(`Invalid frame index ${frameIndex} from replacement algorithm ${state.algorithm}`);
               updateStatus(`Error: Invalid frame index from ${state.algorithm}. Stopping.`, "error");
               finishSimulation(); // Stop simulation on critical error
               return;
          }
          evictedPage = state.physicalMemory[frameIndex]?.page; // Page being kicked out

          if (evictedPage !== null && evictedPage !== undefined && state.pageTable[evictedPage]) {
              state.pageTable[evictedPage].present = false;
              state.pageTable[evictedPage].frame = null;
              state.pageTable[evictedPage].referenced = false; // Reset R bit on eviction
              state.pageTable[evictedPage].modified = false;   // Reset M bit on eviction
              updateStatus(`Page Fault for ${page}. Replacing page ${evictedPage} in Frame ${frameIndex} (via ${state.algorithm}).`);
          } else {
               // This case could happen if the frame selected for replacement was somehow already null or inconsistent
               console.warn(`Replacement issue: Frame ${frameIndex} selected, but no valid evicted page found. Current page: ${page}.`);
               updateStatus(`Page Fault for ${page}. Loading into Frame ${frameIndex} (replacement algo ${state.algorithm} pointed here).`);
               // Proceed to load into the selected frame anyway
          }
      } else {
           updateStatus(`Page Fault for ${page}. Loading into free Frame ${frameIndex}.`);
      }

      // Update page table for the new page
      if (!state.pageTable[page]) {
          state.pageTable[page] = { frame: null, present: false, referenced: false, modified: false };
      }
      state.pageTable[page].present = true;
      state.pageTable[page].frame = frameIndex;
      state.pageTable[page].referenced = true; // Mark as referenced on load/fault
      // Simulate potential write (modified bit) - lower probability than hit modify
      state.pageTable[page].modified = Math.random() < 0.2;

      // Update physical memory representation
      state.physicalMemory[frameIndex] = {
          page: page,
          isLoading: true // Mark for visual feedback
      };

      // Use requestAnimationFrame for smoother visual updates if possible,
      // fallback to setTimeout for the loading effect duration.
      // We need to re-render *after* the isLoading state is cleared.
       const loadingDuration = Math.min(state.speed * 0.6, 600); // Duration for the loading pulse effect
       setTimeout(() => {
          // Check if the page is still the one intended for this frame
          if (state.physicalMemory[frameIndex]?.page === page) {
              state.physicalMemory[frameIndex].isLoading = false;
              renderMemoryGrid(); // Re-render to remove loading state
          }
       }, loadingDuration);
  }

  function handlePageHit(page) {
      if (!state.pageTable[page]) return; // Should not happen on hit

      state.pageTable[page].referenced = true; // Mark as referenced on hit
      // Simulate a higher chance of modification on hit if page is already referenced
      if (state.pageTable[page].referenced && Math.random() < 0.3) {
          state.pageTable[page].modified = true;
      }
  }

  function selectFrameToReplace(currentPage) { // currentPage needed for OPT
      switch (state.algorithm) {
          case 'FIFO': return fifoReplacement();
          case 'LRU': return lruReplacement();
          case 'OPT': return optReplacement(currentPage);
          default:
              console.error("Unknown replacement algorithm:", state.algorithm);
              return 0; // Fallback to replacing the first frame
      }
  }

  // --- Replacement Algorithms ---
  function fifoReplacement() {
      const oldestPage = state.fifoQueue.shift(); // Remove from front (oldest entry)
      if (oldestPage === undefined) {
           console.error("FIFO queue empty during replacement!");
           return 0; // Fallback
      }
      // Add back to end (as it's being replaced by a new page that is now the newest)
      // No, the new page will be added later in updateAlgorithmDataStructures
      const frameIndex = state.pageTable[oldestPage]?.frame;
      return frameIndex ?? 0; // Return frame index or fallback
  }

  function lruReplacement() {
      // In our LRU stack, the front is *most* recent, end is *least* recent
      const lruPage = state.lruStack.pop(); // Remove from end (least recent)
      if (lruPage === undefined) {
           console.error("LRU stack empty during replacement!");
           return 0; // Fallback
      }
      const frameIndex = state.pageTable[lruPage]?.frame;
       // The new page will be pushed to the front later in updateAlgorithmDataStructures
      return frameIndex ?? 0; // Return frame index or fallback
  }

  function optReplacement(currentPage) { // Naming currentPage is confusing, it's the page causing the fault
       const pagesInFrames = state.physicalMemory
                                  .map(frame => frame?.page) // Get page number or undefined
                                  .filter(p => p !== null && p !== undefined); // Filter out empty/invalid frames

       if (pagesInFrames.length === 0) return 0; // Should not happen if memory is full

       let pageToReplace = -1;
       let maxFutureDistance = -1;

       pagesInFrames.forEach(pInMem => {
          let futureDistance = Infinity; // Assume not used again
          // Find the *next* occurrence of pInMem in the *remaining* reference string
          for (let i = state.currentIndex + 1; i < state.referenceString.length; i++) {
               if (state.referenceString[i] === pInMem) {
                   futureDistance = i - state.currentIndex; // Distance from current step
                   break; // Found nearest future use
               }
           }

           // We want to replace the page with the largest future distance
           if (futureDistance > maxFutureDistance) {
               maxFutureDistance = futureDistance;
               pageToReplace = pInMem;
           }
       });

       // If pageToReplace is still -1, it means all pages in memory are needed immediately
       // or there was an issue. It's safest to default to the one with max distance (likely Infinity).
       // However, if multiple pages have Infinity distance, we need a tie-breaker.
       // A common tie-breaker for OPT simulation is FIFO among those never used again.
       if (pageToReplace === -1 || maxFutureDistance === Infinity) {
           const pagesNeverUsedAgain = [];
            pagesInFrames.forEach(pInMem => {
               let found = false;
               for (let i = state.currentIndex + 1; i < state.referenceString.length; i++) {
                    if (state.referenceString[i] === pInMem) {
                        found = true;
                        break;
                    }
                }
                if (!found) pagesNeverUsedAgain.push(pInMem);
            });

            if (pagesNeverUsedAgain.length > 0) {
                // Find which of these pages was loaded earliest (FIFO tie-break)
                let earliestLoadTime = Infinity;
                let fifoTieBreakPage = pagesNeverUsedAgain[0]; // Default

                // This requires tracking load time, which we don't explicitly do.
                // A simpler OPT simulation often just picks the first one found with max distance.
                // Let's stick to the simpler version: the one identified with max distance,
                // or if multiple have Infinity, the last one checked (arbitrary but consistent within loop).
                if (pageToReplace === -1) pageToReplace = pagesInFrames[0]; // Absolute fallback
                // If pageToReplace has Infinity distance, it's already selected.
            } else if (pageToReplace === -1) {
               // All pages are used again, pick the one found with largest finite distance.
               // This case should have been handled by the main loop. Fallback needed.
               pageToReplace = pagesInFrames[0];
               console.warn("OPT fallback: Could not determine optimal page, defaulting.");
            }
       }

       const frameIndex = state.pageTable[pageToReplace]?.frame;
       return frameIndex ?? 0; // Return frame index or fallback
   }

  // --- Update Algorithm Helper Structures ---
  function updateAlgorithmDataStructures(page, isPageFault) {
      // FIFO: Add page to queue only on a page fault (when it enters memory)
      if (isPageFault) {
          // Check if replacing an existing page that might already be conceptually 'in' the queue
          // FIFO queue tracks the order pages *entered frames*.
          // We only add the new page that caused the fault.
          if (!state.fifoQueue.includes(page)) { // Avoid duplicates if somehow possible? Unlikely here.
               state.fifoQueue.push(page); // Add to end (newest)
          }
           // Queue automatically shrinks when fifoReplacement() calls shift()
      }

      // LRU: Always move accessed page to the front (most recent)
      const indexInLru = state.lruStack.indexOf(page);
      if (indexInLru > -1) {
          state.lruStack.splice(indexInLru, 1); // Remove from current position
      }
       state.lruStack.unshift(page); // Add/move to front (most recent)
       // Stack automatically shrinks when lruReplacement() calls pop()
  }

  // --- Rendering Functions ---
  function renderMemoryGrid() {
      elements.memoryGrid.innerHTML = ''; // Clear existing frames
      state.physicalMemory.forEach((frame, index) => {
          const frameElement = document.createElement('div');
          frameElement.className = 'memory-frame border rounded-lg text-xs relative shadow-sm flex items-center justify-center p-1'; // Base classes

          const frameIndexLabel = `<div class="frame-index">F${index}</div>`;
          let frameContent = '';

          if (frame) { // Frame is occupied
              const pageInfo = state.pageTable[frame.page];
              const refBit = pageInfo?.referenced ? 'R' : '-';
              const modBit = pageInfo?.modified ? 'M' : '-';

              if (frame.isLoading) {
                  frameElement.classList.add('bg-red-100', 'border-red-500', 'text-red-700', 'animate-pulse-border', 'frame-loading');
                  frameContent = `
                      <div class="frame-content">
                          <span class="page-number">${frame.page}</span>
                          <span class="loading-text">Loading...</span>
                           <span class="bits">[${refBit} ${modBit}]</span>
                      </div>`;
              } else {
                  frameElement.classList.add('bg-blue-500', 'border-blue-600', 'text-white', 'frame-used');
                   frameContent = `
                      <div class="frame-content">
                          <span class="page-number">${frame.page}</span>
                           <span class="bits">[${refBit} ${modBit}]</span>
                      </div>`;
              }
          } else { // Frame is free
              frameElement.classList.add('bg-slate-200', 'border-slate-300', 'text-slate-600', 'frame-free');
              frameContent = `<div class="frame-content text-sm">Free</div>`;
          }
          frameElement.innerHTML = frameIndexLabel + frameContent;
          elements.memoryGrid.appendChild(frameElement);
      });
  }

  function renderPageTable() {
      elements.pageTableBody.innerHTML = ''; // Clear existing rows
      // Get all unique page numbers involved so far
      const pages = Object.keys(state.pageTable).map(Number).sort((a, b) => a - b);

      if (pages.length === 0) {
          elements.pageTableBody.innerHTML = '<tr><td colspan="5" class="text-center p-6 text-slate-400 text-sm">Run simulation to populate page table.</td></tr>';
          return;
      }

      pages.forEach(page => {
          const entry = state.pageTable[page];
          const row = document.createElement('tr');
          // Alternate row background colors using Tailwind classes
          row.className = 'transition-colors duration-150 odd:bg-white even:bg-slate-50 hover:bg-primary-50';

          const presentStatus = entry.present
               ? '<span class="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800"><i data-lucide="check" class="w-3 h-3 mr-1"></i>Yes</span>'
               : '<span class="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800"><i data-lucide="x" class="w-3 h-3 mr-1"></i>No</span>';

           const refStatus = entry.referenced ? 'Yes' : 'No';
           const modStatus = entry.modified ? 'Yes' : 'No';

          row.innerHTML = `
              <td class="px-4 py-2 whitespace-nowrap font-medium text-slate-800">${page}</td>
              <td class="px-4 py-2 whitespace-nowrap text-slate-600">${entry.present ? entry.frame : '-'}</td>
              <td class="px-4 py-2 whitespace-nowrap">${presentStatus}</td>
              <td class="px-4 py-2 whitespace-nowrap text-slate-600">${refStatus}</td>
              <td class="px-4 py-2 whitespace-nowrap text-slate-600">${modStatus}</td>
          `;
          elements.pageTableBody.appendChild(row);
      });
       lucide.createIcons(); // Render icons in the table status badges
  }

  function updateStats() {
      elements.pageFaults.textContent = state.pageFaults;
      const totalAccesses = state.hits + state.pageFaults;
      const hitRatio = totalAccesses > 0 ? Math.round((state.hits / totalAccesses) * 100) : 0;
      elements.hitRatio.textContent = `${hitRatio}%`;
  }

  function updateAlgorithmVisualization() {
       let content = `<h4 class="text-sm font-semibold mb-1.5 text-purple-800 flex items-center gap-1"><i data-lucide="list-checks" class="w-4 h-4"></i> ${state.algorithm} State</h4>`;
       const isEmpty = (arr) => arr.length === 0;
       const formatArray = (arr) => isEmpty(arr) ? '<span class="text-slate-400 italic">Empty</span>' : arr.join(' → ');

       switch (state.algorithm) {
           case 'FIFO':
               content += `<p class="text-xs text-purple-700 mb-1">Queue (Oldest → Newest):<br><span class="font-mono block mt-0.5 p-1 bg-purple-100 rounded text-xs">${formatArray(state.fifoQueue)}</span></p>`;
               content += `<p class="text-xs text-purple-600">Next to replace: <span class="font-bold">${state.fifoQueue[0] ?? 'N/A'}</span></p>`;
               break;
           case 'LRU':
                // Display stack reversed so LRU (end of stack) is visually first in the list
               const displayLru = [...state.lruStack].reverse();
               content += `<p class="text-xs text-purple-700 mb-1">Usage (LRU → MRU):<br><span class="font-mono block mt-0.5 p-1 bg-purple-100 rounded text-xs">${formatArray(displayLru)}</span></p>`;
               content += `<p class="text-xs text-purple-600">Next to replace (LRU): <span class="font-bold">${state.lruStack[state.lruStack.length - 1] ?? 'N/A'}</span></p>`;
               break;
           case 'OPT':
               content += `<p class="text-xs text-purple-700 mb-1">Looks ahead in the reference string.</p>`;
               const futureRefs = state.referenceString.slice(state.currentIndex, state.currentIndex + 10).join(', ');
               content += `<p class="text-xs text-purple-600">Upcoming refs: <span class="font-mono">${futureRefs || '<End>'}...</span></p>`;
               // Finding the actual OPT page requires lookahead logic already in selectFrameToReplace
               // Maybe add a note: "Selects page used furthest in the future from list above."
               content += `<p class="text-xs text-purple-600 mt-1">Chooses page used furthest ahead.</p>`
               break;
       }
       elements.algorithmVis.innerHTML = content;
        lucide.createIcons(); // Render icon in vis title
   }

  function renderStatsChart() {
      if (!elements.statsChartCtx) return; // Exit if canvas context is not available

      const totalAccesses = state.pageFaults + state.hits;
      const faultCount = state.pageFaults;
      const hitCount = state.hits;
      // Data for the chart (can be counts or percentages)
      const chartData = [faultCount, hitCount];

      // Destroy previous chart instance if it exists to prevent conflicts
      if (state.chartInstance) {
          state.chartInstance.destroy();
      }

      // Create new chart instance
      state.chartInstance = new Chart(elements.statsChartCtx, {
          type: 'doughnut', // Or 'pie'
          data: {
              labels: [`Page Faults (${faultCount})`, `Hits (${hitCount})`],
              datasets: [{
                  label: 'Access Outcome',
                  data: chartData,
                  backgroundColor: [
                      '#EF4444', // Tailwind red-500
                      '#22C55E'  // Tailwind green-500
                  ],
                  borderColor: [ // Add border for visual separation
                      theme('colors.white'), // Use theme function if available, else fallback
                      theme('colors.white')
                  ],
                  borderWidth: 2,
                   hoverOffset: 4 // Slightly expand segment on hover
              }]
          },
          options: {
              responsive: true,
              maintainAspectRatio: false, // Allow chart to fill container better
              animation: {
                  animateScale: true,
                  animateRotate: true,
                   duration: 500 // Adjust animation speed
              },
              plugins: {
                  legend: {
                      position: 'bottom',
                      labels: {
                          boxWidth: 12,
                          padding: 15, // Spacing for legend items
                          font: { size: 10 }
                      }
                  },
                  tooltip: {
                      backgroundColor: 'rgba(0, 0, 0, 0.7)', // Darker tooltip
                      titleFont: { weight: 'bold'},
                      bodyFont: { size: 11 },
                      padding: 8,
                      cornerRadius: 4,
                      callbacks: {
                          label: function (context) {
                              let label = context.label || '';
                              if (label) label += ': ';
                              const value = context.raw || 0;
                              const percentage = totalAccesses > 0 ? ((value / totalAccesses) * 100).toFixed(1) : 0;
                              label += `${value} (${percentage}%)`;
                              return label;
                          }
                      }
                  },
                  title: {
                      display: true,
                      text: totalAccesses > 0 ? 'Hit vs. Fault Distribution' : 'Run Simulation for Stats',
                      font: { size: 14, weight: 'normal' }, // Adjusted title font
                      color: '#475569' // slate-600
                  }
              },
              cutout: '60%' // Make doughnut hole slightly larger
          }
      });
  }

  // --- Initial Setup Call ---
  init();
});

// Helper to access Tailwind theme colors safely in JS (basic version)
function theme(path) {
  const keys = path.split('.');
  let current = window.tailwind?.config?.theme?.extend?.colors || window.tailwind?.config?.theme?.colors || {};
  for (const key of keys) {
      if (current[key] === undefined) {
          // Fallback colors if theme isn't found or fully parsed
          if (path === 'colors.white') return '#ffffff';
          if (path === 'colors.red.500') return '#ef4444';
          if (path === 'colors.green.500') return '#22c55e';
          return '#64748b'; // slate-500 as default fallback
      }
      current = current[key];
  }
  return typeof current === 'string' ? current : '#64748b';
}