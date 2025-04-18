document.addEventListener("DOMContentLoaded", () => {
  // --- DOM Elements ---
  const ramFramesInput = document.getElementById("ramFramesInput");
  const accessSequenceInput = document.getElementById("accessSequenceInput");
  const resetBtn = document.getElementById("resetBtn");
  const stepBtn = document.getElementById("stepBtn");
  const runAllBtn = document.getElementById("runAllBtn");
  const ramDisplay = document.getElementById("ramDisplay");
  const statusText = document.getElementById("statusText");
  const faultCount = document.getElementById("faultCount");
  const accessCount = document.getElementById("accessCount");
  const lruQueueDisplay = document.getElementById("lruQueueDisplay");
  const logArea = document.getElementById("logArea");

  // --- Simulation State ---
  let numFrames = 0;
  let accessSequence = [];
  let ramFrames = []; // Stores page number or null
  let lruQueue = []; // Array acting as queue (push for new, shift for remove LRU)
  let pageTable = {}; // { pageNum: { frame: frameIndex, present: boolean } }
  let currentStep = 0;
  let pageFaults = 0;
  let totalAccesses = 0;
  let simulationRunning = false;

  // --- Helper Functions ---

  function logMessage(message, type = "info") {
    const logEntry = document.createElement("div");
    const timestamp = new Date().toLocaleTimeString();
    logEntry.innerHTML = `<span class="text-gray-500 mr-2">[${timestamp}]</span> ${message}`;
    if (type === "fault") {
      logEntry.classList.add("text-red-600");
    } else if (type === "hit") {
      logEntry.classList.add("text-green-600");
    } else if (type === "init" || type === "evict") {
      logEntry.classList.add("text-blue-600");
    }
    logArea.appendChild(logEntry);
    // Scroll to bottom
    logArea.scrollTop = logArea.scrollHeight;
  }

  function updateRamDisplay() {
    ramDisplay.innerHTML = ""; // Clear previous display
    for (let i = 0; i < numFrames; i++) {
      const frameDiv = document.createElement("div");
      frameDiv.classList.add(
        "border",
        "p-3",
        "rounded",
        "flex",
        "justify-between",
        "items-center",
        "shadow-sm",
        "frame",
      );
      const frameLabel = `Frame ${i}:`;
      let content;
      let bgColor = "bg-gray-200"; // Empty frame color
      let textColor = "text-gray-500";

      if (ramFrames[i] !== null) {
        content = `Page ${ramFrames[i]}`;
        bgColor = "bg-blue-200"; // Occupied frame color
        textColor = "text-blue-800";
      } else {
        content = "Empty";
      }
      frameDiv.innerHTML = `<span class="font-medium ${textColor}">${frameLabel}</span><span class="font-bold text-lg ${textColor}">${content}</span>`;
      frameDiv.classList.add(bgColor);
      ramDisplay.appendChild(frameDiv);
    }
    // Add placeholders if fewer frames than visual space might imply
    if (numFrames < 3) {
      for (let i = numFrames; i < 3; i++) {
        // Ensure min visual height looks okay
        const frameDiv = document.createElement("div");
        frameDiv.classList.add(
          "border",
          "p-3",
          "rounded",
          "flex",
          "justify-between",
          "items-center",
          "shadow-sm",
          "frame",
          "bg-gray-100",
          "border-dashed",
          "opacity-50",
        );
        frameDiv.innerHTML = `<span class="font-medium text-gray-400">Frame ${i}</span><span class="font-bold text-lg text-gray-400">-</span>`;
        ramDisplay.appendChild(frameDiv);
      }
    }
  }

  function updateStatusDisplay(message = statusText.textContent) {
    // Keep last message if not provided
    statusText.textContent = message;
    faultCount.textContent = pageFaults;
    accessCount.textContent = totalAccesses;
    lruQueueDisplay.textContent = `[ ${lruQueue.join(", ")} ]`;
  }

  function updateButtonStates() {
    const canStep = currentStep < accessSequence.length && !simulationRunning;
    stepBtn.disabled = !canStep;
    runAllBtn.disabled = !canStep;
    resetBtn.disabled = simulationRunning; // Disable reset while Run All is active
  }

  // --- Simulation Logic ---

  function resetSimulation() {
    if (simulationRunning) return; // Prevent reset during Run All

    // 1. Read and Validate Inputs
    numFrames = parseInt(ramFramesInput.value, 10);
    const sequenceStr = accessSequenceInput.value.trim();

    if (isNaN(numFrames) || numFrames <= 0) {
      alert("Please enter a positive number for RAM frames.");
      return;
    }

    try {
      accessSequence =
        sequenceStr === ""
          ? []
          : sequenceStr.split(",").map((p) => {
              const pageNum = parseInt(p.trim(), 10);
              if (isNaN(pageNum) || pageNum < 0) {
                // Allow page 0
                throw new Error(`Invalid page number detected: '${p.trim()}'`);
              }
              return pageNum;
            });
    } catch (error) {
      alert(`Error parsing access sequence: ${error.message}`);
      return;
    }

    // 2. Reset State
    ramFrames = Array(numFrames).fill(null);
    lruQueue = [];
    pageTable = {};
    currentStep = 0;
    pageFaults = 0;
    totalAccesses = 0;
    logArea.innerHTML = ""; // Clear log

    // 3. Update Display
    logMessage("--- Simulation Initialized ---", "init");
    logMessage(`RAM Frames: ${numFrames}`, "init");
    logMessage(`Access Sequence: [${accessSequence.join(", ")}]`, "init");
    updateRamDisplay();
    updateStatusDisplay("Initialized. Ready to step or run.");
    updateButtonStates();
  }

  function stepSimulation() {
    if (currentStep >= accessSequence.length || simulationRunning) {
      if (currentStep >= accessSequence.length) {
        logMessage("--- End of Access Sequence ---");
        updateStatusDisplay(`Finished after ${totalAccesses} accesses.`);
      }
      updateButtonStates(); // Ensure buttons are disabled correctly
      return false; // Indicate simulation cannot continue
    }

    const pageToAccess = accessSequence[currentStep];
    totalAccesses++;
    let currentStatus = `Step ${currentStep + 1}: Accessing Page ${pageToAccess}`;
    logMessage(`\nStep ${currentStep + 1}: Accessing Page ${pageToAccess}`);

    // --- Check Page Table (Hit or Fault) ---
    if (pageTable[pageToAccess]?.present) {
      // Optional chaining for safety
      // Page Hit
      currentStatus += " -> Page Hit!";
      logMessage(
        `  ✅ Page ${pageToAccess} found in Frame ${pageTable[pageToAccess].frame}. (Hit)`,
        "hit",
      );

      // Update LRU: Move accessed page to the end (most recently used)
      const indexInQueue = lruQueue.indexOf(pageToAccess);
      if (indexInQueue > -1) {
        lruQueue.splice(indexInQueue, 1); // Remove from current position
      }
      lruQueue.push(pageToAccess); // Add to end
    } else {
      // Page Fault
      pageFaults++;
      currentStatus += " -> 💥 Page Fault!";
      logMessage(`  💥 Page ${pageToAccess} not in RAM. (Page Fault)`, "fault");

      let targetFrame = -1;

      // Find an empty frame
      targetFrame = ramFrames.indexOf(null);

      if (targetFrame !== -1) {
        // Found an empty frame
        logMessage(`  Found empty Frame ${targetFrame}.`);
      } else {
        // Eviction needed (LRU)
        if (lruQueue.length === 0) {
          // Should not happen if numFrames > 0 and fault occurred, but safeguard
          console.error("LRU queue is empty during fault with full RAM!");
          logMessage("  ERROR: LRU queue empty unexpectedly.", "fault");
          // Reset state or halt might be appropriate here
          // For now, just stop the step
          updateButtonStates();
          return false;
        }
        const victimPage = lruQueue.shift(); // Get least recently used page (from front)
        targetFrame = pageTable[victimPage]?.frame; // Get victim's frame

        if (targetFrame === undefined || targetFrame === null) {
          console.error(
            `Could not find frame for victim page ${victimPage}. Page table inconsistency.`,
          );
          logMessage(
            `  ERROR: Cannot find frame for victim Page ${victimPage}.`,
            "fault",
          );
          updateButtonStates();
          return false; // Stop on inconsistency
        }

        logMessage(
          `  RAM full. Evicting Page ${victimPage} (LRU) from Frame ${targetFrame}.`,
          "evict",
        );

        // Update page table for victim
        pageTable[victimPage].present = false;
        pageTable[victimPage].frame = null;
        ramFrames[targetFrame] = null; // Mark frame empty
      }

      // Load the new page into the target frame
      logMessage(`  Loading Page ${pageToAccess} into Frame ${targetFrame}.`);
      ramFrames[targetFrame] = pageToAccess;

      // Update page table for the new page
      if (!pageTable[pageToAccess]) {
        pageTable[pageToAccess] = { frame: null, present: false }; // Initialize if first time
      }
      pageTable[pageToAccess].frame = targetFrame;
      pageTable[pageToAccess].present = true;

      // Add new page to end of LRU queue
      const indexInQueue = lruQueue.indexOf(pageToAccess);
      if (indexInQueue > -1) lruQueue.splice(indexInQueue, 1); // Should not be present, but safer
      lruQueue.push(pageToAccess);
    }

    // --- Update State and Display ---
    currentStep++;
    updateRamDisplay();
    updateStatusDisplay(currentStatus); // Set the final status message for this step
    updateButtonStates(); // Check if simulation ended

    // Check again if simulation is now finished
    if (currentStep >= accessSequence.length) {
      logMessage("\n--- End of Access Sequence ---");
      updateStatusDisplay(`Finished. Page ${pageToAccess} accessed.`); // Final status
      updateButtonStates();
      return false; // Finished
    }

    return true; // Indicate step was successful and simulation can continue
  }

  async function runAllSimulation() {
    if (simulationRunning || currentStep >= accessSequence.length) return;

    simulationRunning = true;
    updateButtonStates(); // Disable buttons

    // Use setInterval for a non-blocking loop with delay
    const intervalId = setInterval(() => {
      const canContinue = stepSimulation();
      if (!canContinue) {
        clearInterval(intervalId); // Stop the interval
        simulationRunning = false;
        updateButtonStates(); // Re-enable relevant buttons
        logMessage("\n--- Run All Complete ---", "init");
      }
    }, 150); // Delay in milliseconds (adjust for speed)
  }

  // --- Event Listeners ---
  resetBtn.addEventListener("click", resetSimulation);
  stepBtn.addEventListener("click", stepSimulation);
  runAllBtn.addEventListener("click", runAllSimulation);

  // --- Initial Setup ---
  resetSimulation(); // Initialize with default values on load
});
