const stepToItemMap = {
  1: 'stand',
  2: 'burette',
  3: 'beaker',
  4: 'ph_meter',
  5: 'glycine',
  6: 'naoh'
};

   const state = {
  currentStep: 0,
  experimentStarted: false,
  // Keys MUST match data-accept and data-item strings used in HTML
  setupComplete: {
    stand: false,
    burette: false,
    beaker: false,
    ph_meter: false,
    glycine: false,
    naoh: false
  },
  titrationData: [],       // Array of {volume, pH}
  currentVolume: 0,        // mL of NaOH added
  buretteVolume: 50,       // mL remaining in burette
  titrationActive: false,
  fineIncrementEnabled: false,
  coarseIncrementEnabled: true
};

/* ============================================
   UI Controller
   ============================================ */
const UI = {
  landingScreen: document.getElementById('landing-screen'),
  experimentScreen: document.getElementById('experiment-screen'),
  startBtn: document.getElementById('start-btn'),
  resetLandingBtn: document.getElementById('reset-landing-btn'),
  add05mlBtn: document.getElementById('add-05ml-btn'),
  add01mlBtn: document.getElementById('add-01ml-btn'),
  stopBtn: document.getElementById('stop-btn'),
  stepPopup: document.getElementById('step-popup'),
  popupStep: null,
  popupText: null,
  controlPanel: document.getElementById('control-panel'),
  buretteLevel: document.getElementById('burette-level'),
  beakerLiquid: document.getElementById('beaker-liquid'),
  stirBar: document.getElementById('stir-bar'),
  phDisplay: document.getElementById('ph-value'),
  dropAnimation: document.getElementById('drop-animation'),
  tableBody: document.getElementById('table-body'),
  graphContainer: document.getElementById('graph-container'),
  graphCanvas: document.getElementById('graph-canvas'),
  resultsPanel: document.getElementById('results-panel'),
  pka1Value: document.getElementById('pka1-value'),
  pka2Value: document.getElementById('pka2-value'),
  piValue: document.getElementById('pi-value'),

  // drop zones: keys are arbitrary, but dataset.accept strings are authoritative.
  dropZones: {
    stand: document.getElementById('burette-stand-slot'),
    burette: document.getElementById('burette-slot'),
    beaker: document.getElementById('beaker-slot'),
    ph_meter: document.getElementById('ph-meter-slot'),
    glycine: document.getElementById('glycine-slot'),
    naoh: document.getElementById('naoh-slot')
  },

  // placed items mapped by the dataset.accept names
  placedItems: {
    stand: document.getElementById('stand-placed'),
    burette: document.getElementById('burette-placed'),
    beaker: document.getElementById('beaker-placed'),
    ph_meter: document.getElementById('ph-meter-placed')
  },

  init() {
    this.popupStep = this.stepPopup.querySelector('.popup-step');
    this.popupText = this.stepPopup.querySelector('.popup-text');
  },

  showScreen(screen) {
    this.landingScreen.classList.add('hidden');
    this.experimentScreen.classList.add('hidden');
    screen.classList.remove('hidden');
  },

  updatePopup(stepNum, text) {
    this.popupStep.textContent = `Step ${stepNum}`;
    this.popupText.textContent = text;
    this.stepPopup.classList.remove('hidden');
    this.stepPopup.style.animation = 'none';
    this.stepPopup.offsetHeight;
    this.stepPopup.style.animation = 'slideIn 0.3s ease';
  },

  hidePopup() {
    this.stepPopup.classList.add('hidden');
  },

  updatePHDisplay(ph) {
    const display = this.phDisplay.parentElement;
    display.classList.add('updating');
    setTimeout(() => {
      this.phDisplay.textContent = ph.toFixed(2);
      display.classList.remove('updating');
    }, 150);
  },

  updateBuretteLevel(volumeRemaining) {
    const percentage = (volumeRemaining / 50) * 100;
    this.buretteLevel.style.height = `${percentage}%`;
  },

  updateBeakerLiquid(volume, pH) {
    const baseVolume = 25; // 25 mL glycine
    const total = baseVolume + volume;
    const max = 75;
    const fillPercent = Math.min((total / max) * 100, 95);
    this.beakerLiquid.style.height = `${fillPercent}%`;

    let hue;
    if (pH < 4) hue = 0;
    else if (pH < 7) hue = 45 + (pH - 4) * 15;
    else if (pH < 10) hue = 180 + (pH - 7) * 20;
    else hue = 260;
    this.beakerLiquid.style.background = `hsl(${hue}, 60%, 70%)`;
  },

  triggerStirAnimation() {
    this.stirBar.classList.remove('hidden');
    this.stirBar.classList.add('stirring');
    setTimeout(() => this.stirBar.classList.remove('stirring'), 500);
  }
};

/* ============================================
   Drag & Drop Handler
   ============================================ */
const DragDrop = {
  draggedItem: null,
  draggedType: null,

  init() {
    // Bind draggable items (on both landing and equipment-tray)
   const items = []; // disable HTML5 drag (mobile incompatible)

    items.forEach(item => {
      item.addEventListener('dragstart', this.handleDragStart.bind(this));
      item.addEventListener('dragend', this.handleDragEnd.bind(this));
    });

    // Bind drop zones using dataset.accept
    Object.values(UI.dropZones).forEach(zone => {
      if (!zone) return;
      zone.addEventListener('dragover', this.handleDragOver.bind(this));
      zone.addEventListener('dragleave', this.handleDragLeave.bind(this));
      zone.addEventListener('drop', this.handleDrop.bind(this));
    });
  },

  handleDragStart(e) {
    this.draggedItem = e.target.closest('.lab-item');
    this.draggedType = this.draggedItem.dataset.item;
    this.draggedItem.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.draggedType);
  },

  handleDragEnd() {
    if (this.draggedItem) this.draggedItem.classList.remove('dragging');
    this.draggedItem = null;
    this.draggedType = null;
    Object.values(UI.dropZones).forEach(z => { if (z) z.classList.remove('drag-over'); });
  },

  handleDragOver(e) {
    e.preventDefault();
    const zone = e.target.closest('.drop-zone');
    if (zone && this.canDrop(zone)) {
      e.dataTransfer.dropEffect = 'move';
      zone.classList.add('drag-over');
    }
  },

  handleDragLeave(e) {
    const zone = e.target.closest('.drop-zone');
    if (zone) zone.classList.remove('drag-over');
  },

  handleDrop(e) {
    e.preventDefault();
    const zone = e.target.closest('.drop-zone');
    if (!zone) return;
    zone.classList.remove('drag-over');

    const itemType = e.dataTransfer.getData('text/plain'); // e.g., "ph_meter"
    const acceptedType = zone.dataset.accept;             // e.g., "ph_meter"

    if (itemType === acceptedType && this.canDrop(zone)) {
      this.placeItem(itemType, zone);
      StepController.checkStepCompletion();
    } else {
      // Optional feedback (flash)
      Animations.pulseElement(zone);
    }
  },

  canDrop(zone) {
    const acceptedType = zone.dataset.accept; // must match state.setupComplete keys
    const currentStep = state.currentStep;
    const requiredOrder = ['stand', 'burette', 'beaker', 'ph_meter', 'glycine', 'naoh'];
    const itemIndex = requiredOrder.indexOf(acceptedType);

    if (currentStep >= 1 && currentStep <= 6) {
      return itemIndex === currentStep - 1 && !state.setupComplete[acceptedType];
    }
    return false;
  },

  placeItem(itemType, zone) {
    // Mark zone visually completed
    zone.classList.add('completed');

    // Mark state using the exact itemType (do NOT normalize)
    state.setupComplete[itemType] = true;

    // Show placed item visual if exists
    if (UI.placedItems[itemType]) {
      UI.placedItems[itemType].classList.remove('hidden');
    }

    // Special handling for reagents and visuals
    if (itemType === 'glycine') {
      UI.beakerLiquid.style.height = '40%';
      UI.beakerLiquid.style.background = 'hsl(180, 50%, 70%)';
      zone.innerHTML = '<span class="zone-label">Glycine Added ✓</span>';
    } else if (itemType === 'naoh') {
      UI.buretteLevel.style.height = '100%';
      zone.innerHTML = '<span class="zone-label">NaOH Loaded ✓</span>';
    }

    // Pulse animation
    Animations.pulseElement(zone);
  }
};

/* ============================================
   Step Controller (Popup Manager)
   ============================================ */
const StepController = {
  steps: [
    { text: "Welcome! Click 'Start Experiment' to begin the titration setup." },
    { text: "Drag the burette stand to its position to set up the apparatus." },
    { text: "Now mount the burette onto the stand." },
    { text: "Place the beaker below the burette to collect the titrant." },
    { text: "Attach the pH meter probe into the beaker." },
    { text: "Add the glycine solution (25 mL) to the beaker." },
    { text: "Fill the burette with 0.1M NaOH solution." },
    { text: "Setup complete! Record the initial pH and begin titration." },
    { text: "Add NaOH in increments. Use 0.5 mL for regular additions, 0.1 mL near equivalence point." }
  ],

  init() {
    state.currentStep = 0;
  },

  startExperiment() {
    state.experimentStarted = true;
    UI.showScreen(UI.experimentScreen);
    this.advanceStep();
  },

  advanceStep() {
    state.currentStep++;
    if (state.currentStep < this.steps.length) {
      UI.updatePopup(state.currentStep, this.steps[state.currentStep].text);
      clearDropZoneHighlight();
if (stepToItemMap[state.currentStep]) {
  highlightDropZone(stepToItemMap[state.currentStep]);
}
    }

    // Special actions when reaching specific steps
    if (state.currentStep === 7) {
      // show initial pH and then advance
      TitrationSimulator.recordInitialReading();
      setTimeout(() => this.advanceStep(), 1200);
    } else if (state.currentStep === 8) {
      this.enableTitrationControls();
    }
  },

checkStepCompletion() {
  const step = state.currentStep;

  const stepRequirements = {
    1: 'stand',
    2: 'burette',
    3: 'beaker',
    4: 'ph_meter',
    5: 'glycine',
    6: 'naoh'
  };

  // 🔹 VISUAL: highlight correct drop zone
  clearDropZoneHighlight();
  if (stepRequirements[step]) {
    highlightDropZone(stepRequirements[step]);
  }

  // 🔹 EXISTING LOGIC (unchanged)
  if (stepRequirements[step] && state.setupComplete[stepRequirements[step]]) {
    clearDropZoneHighlight();
    this.advanceStep();
  }
},


  enableTitrationControls() {
    UI.controlPanel.classList.remove('hidden');
    UI.add05mlBtn.disabled = false;
    state.titrationActive = true;
  }
};

/* ============================================
   Titration Simulator (pH Generator)
   ============================================ */
const TitrationSimulator = {
  calculatePH(volumeNaOH) {
    const v = volumeNaOH;
    let pH;

    if (v === 0) {
      pH = 2.35 + Math.random() * 0.2;
    } else if (v < 5) {
      pH = 2.35 + (v * 0.15) + Math.random() * 0.05;
    } else if (v < 10) {
      pH = 3.1 + (v - 5) * 0.6 + Math.random() * 0.08;
    } else if (v < 15) {
      pH = 6.1 + (v - 10) * 0.12 + Math.random() * 0.05;
    } else if (v < 20) {
      pH = 6.7 + (v - 15) * 0.1 + Math.random() * 0.04;
    } else if (v < 25) {
      pH = 7.2 + (v - 20) * 0.3 + Math.random() * 0.06;
    } else if (v < 30) {
      pH = 8.7 + (v - 25) * 0.4 + Math.random() * 0.08;
    } else if (v < 35) {
      pH = 10.7 + (v - 30) * 0.15 + Math.random() * 0.05;
    } else {
      pH = Math.min(11.45 + (v - 35) * 0.03, 12);
    }

    return Math.round(pH * 100) / 100;
  },

  recordInitialReading() {
    const initialPH = this.calculatePH(0);
    this.addReading(0, initialPH);
  },

  addNaOH(volume) {
    if (!state.titrationActive) return;

    state.currentVolume += volume;
    state.buretteVolume -= volume;

    const newPH = this.calculatePH(state.currentVolume);

    Animations.dropAnimation(() => {
      this.addReading(state.currentVolume, newPH);
      UI.updateBuretteLevel(state.buretteVolume);
      UI.updateBeakerLiquid(state.currentVolume, newPH);
      UI.triggerStirAnimation();
      this.checkSlopeCondition();

      if (newPH >= 11 || state.currentVolume >= 45) {
        this.completeTitration();
      }
    });
  },

  addReading(volume, pH) {
    state.titrationData.push({ volume, pH });
    TableUpdater.addRow(volume, pH);
    UI.updatePHDisplay(pH);
  },

  checkSlopeCondition() {
    const data = state.titrationData;
    if (data.length < 2) return;

    const last = data[data.length - 1];
    const prev = data[data.length - 2];
    const slope = (last.pH - prev.pH) / (last.volume - prev.volume);

    if (slope > 0.3 && last.pH < 8) {
      UI.add01mlBtn.disabled = false;
      state.fineIncrementEnabled = true;
    } else if (last.pH >= 8) {
      UI.add01mlBtn.disabled = true;
      state.fineIncrementEnabled = false;
    }
  },

  completeTitration() {
    state.titrationActive = false;
    UI.add05mlBtn.disabled = true;
    UI.add01mlBtn.disabled = true;
    UI.hidePopup();
    setTimeout(() => {
      GraphDrawer.draw();
      PKACalculator.calculate();
    }, 500);
  }
};

/* ============================================
   Table Updater
   ============================================ */
const TableUpdater = {
  addRow(volume, pH) {
    const row = document.createElement('tr');
    row.className = 'new-row';
    row.innerHTML = `
      <td>${volume.toFixed(1)}</td>
      <td>${pH.toFixed(2)}</td>
    `;
    UI.tableBody.appendChild(row);

    const tableScroll = UI.tableBody.closest('.table-scroll');
    if (tableScroll) tableScroll.scrollTop = tableScroll.scrollHeight;
    setTimeout(() => row.classList.remove('new-row'), 500);
  },

  clear() {
    UI.tableBody.innerHTML = '';
  }
};

/* ============================================
   Graph Drawer
   ============================================ */
const GraphDrawer = {
  canvas: null,
  ctx: null,
  padding: 50,

  draw() {
    UI.graphContainer.classList.remove('hidden');
    this.canvas = UI.graphCanvas;
    this.ctx = this.canvas.getContext('2d');

    const data = state.titrationData;
    if (data.length < 2) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const maxVolume = Math.max(...data.map(d => d.volume)) + 2;
    const maxPH = 14;
    const plotWidth = this.canvas.width - 2 * this.padding;
    const plotHeight = this.canvas.height - 2 * this.padding;

    const scaleX = plotWidth / maxVolume;
    const scaleY = plotHeight / maxPH;

    this.drawAxes(maxVolume, maxPH, scaleX, scaleY, plotWidth, plotHeight);
    this.drawDataLine(data, scaleX, scaleY);
    this.drawDataPoints(data, scaleX, scaleY);
    this.addLabels();
  },

  drawAxes(maxVolume, maxPH, scaleX, scaleY, plotWidth, plotHeight) {
    const ctx = this.ctx;
    const p = this.padding;

    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(p, p);
    ctx.lineTo(p, this.canvas.height - p);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(p, this.canvas.height - p);
    ctx.lineTo(this.canvas.width - p, this.canvas.height - p);
    ctx.stroke();

    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#666';
    ctx.textAlign = 'center';

    for (let v = 0; v <= maxVolume; v += 5) {
      const x = p + v * scaleX;
      ctx.beginPath();
      ctx.moveTo(x, this.canvas.height - p);
      ctx.lineTo(x, this.canvas.height - p + 5);
      ctx.stroke();
      ctx.fillText(v.toString(), x, this.canvas.height - p + 18);
    }

    ctx.textAlign = 'right';
    for (let ph = 0; ph <= 14; ph += 2) {
      const y = this.canvas.height - p - ph * scaleY;
      ctx.beginPath();
      ctx.moveTo(p - 5, y);
      ctx.lineTo(p, y);
      ctx.stroke();
      ctx.fillText(ph.toString(), p - 10, y + 4);
    }
  },

  drawDataLine(data, scaleX, scaleY) {
    const ctx = this.ctx;
    const p = this.padding;
    ctx.strokeStyle = 'hsl(220, 70%, 50%)';
    ctx.lineWidth = 2;
    ctx.beginPath();

    data.forEach((point, i) => {
      const x = p + point.volume * scaleX;
      const y = this.canvas.height - p - point.pH * scaleY;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.stroke();
  },

  drawDataPoints(data, scaleX, scaleY) {
    const ctx = this.ctx;
    const p = this.padding;
    ctx.fillStyle = 'hsl(220, 70%, 50%)';
    data.forEach(point => {
      const x = p + point.volume * scaleX;
      const y = this.canvas.height - p - point.pH * scaleY;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    });
  },

  addLabels() {
    const ctx = this.ctx;
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#333';
    ctx.textAlign = 'center';
    ctx.fillText('Volume of NaOH (mL)', this.canvas.width / 2, this.canvas.height - 10);

    ctx.save();
    ctx.translate(15, this.canvas.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('pH', 0, 0);
    ctx.restore();

    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('Titration Curve: Glycine with NaOH', this.canvas.width / 2, 25);
  }
};

/* ============================================
   pKa/pI Calculator
   ============================================ */
const PKACalculator = {
  calculate() {
    const data = state.titrationData;
    if (data.length < 5) return;

    let pka1 = null;
    let pka2 = null;

    const pka1Candidates = data.filter(d => d.pH >= 2.2 && d.pH <= 3.0);
    if (pka1Candidates.length > 0) pka1 = pka1Candidates.reduce((s,d)=>s+d.pH,0)/pka1Candidates.length;
    else pka1 = 2.34;

    const pka2Candidates = data.filter(d => d.pH >= 9.0 && d.pH <= 10.2);
    if (pka2Candidates.length > 0) pka2 = pka2Candidates.reduce((s,d)=>s+d.pH,0)/pka2Candidates.length;
    else pka2 = 9.60;

    const pI = (pka1 + pka2) / 2;
    this.displayResults(pka1, pka2, pI);
  },

  displayResults(pka1, pka2, pI) {
    UI.resultsPanel.classList.remove('hidden');
    UI.pka1Value.textContent = pka1.toFixed(2);
    UI.pka2Value.textContent = pka2.toFixed(2);
    UI.piValue.textContent = pI.toFixed(2);
    UI.resultsPanel.style.animation = 'slideIn 0.3s ease';
  }
};

/* ============================================
   Animations
   ============================================ */
const Animations = {
  dropAnimation(callback) {
    const drop = UI.dropAnimation;
    if (!drop) { if (callback) callback(); return; }
    drop.classList.remove('hidden', 'falling');
    drop.offsetHeight;
    drop.classList.add('falling');
    setTimeout(() => {
      drop.classList.remove('falling');
      drop.classList.add('hidden');
      if (callback) callback();
    }, 600);
  },

  pulseElement(element) {
    element.style.animation = 'none';
    element.offsetHeight;
    element.style.animation = 'highlightRow 0.5s ease';
  }
};

/* ============================================
   Reset Controller
   ============================================ */
const ResetController = {
  resetAll() {
    state.currentStep = 0;
    state.experimentStarted = false;
    state.setupComplete = {
      stand: false,
      burette: false,
      beaker: false,
      ph_meter: false,
      glycine: false,
      naoh: false
    };
    state.titrationData = [];
    state.currentVolume = 0;
    state.buretteVolume = 50;
    state.titrationActive = false;
    state.fineIncrementEnabled = false;

    UI.showScreen(UI.landingScreen);
    UI.hidePopup();

    Object.values(UI.dropZones).forEach(zone => {
      if (!zone) return;
      zone.classList.remove('completed');
      const label = zone.querySelector('.zone-label');
      if (label && label.textContent.includes('✓')) {
        const accept = zone.dataset.accept;
        if (accept === 'glycine') zone.innerHTML = '<span class="zone-label">Drop Glycine Here</span>';
        else if (accept === 'naoh') zone.innerHTML = '<span class="zone-label">Drop NaOH Here</span>';
      }
    });

    Object.values(UI.placedItems).forEach(item => { if (item) item.classList.add('hidden'); });

    UI.buretteLevel.style.height = '0%';
    UI.beakerLiquid.style.height = '0%';
    UI.phDisplay.textContent = '--';
    UI.stirBar.classList.add('hidden');

    UI.controlPanel.classList.add('hidden');
    UI.add05mlBtn.disabled = true;
    UI.add01mlBtn.disabled = true;

    TableUpdater.clear();
    UI.graphContainer.classList.add('hidden');
    UI.resultsPanel.classList.add('hidden');
  }
};
/* ============================================
   POINTER DRAG (MOBILE + DESKTOP)
   ============================================ */

const PointerDrag = {
  activeItem: null,
  offsetX: 0,
  offsetY: 0,
originalPos: new Map(), 
  init() {
    document.querySelectorAll('.lab-item').forEach(item => {
      item.addEventListener('pointerdown', this.start.bind(this));
    });

    document.addEventListener('pointermove', this.move.bind(this));
    document.addEventListener('pointerup', this.end.bind(this));
  },

  start(e) {
    const item = e.currentTarget;
    const rect = item.getBoundingClientRect();

    this.activeItem = item;
    this.offsetX = e.clientX - rect.left;
    this.offsetY = e.clientY - rect.top;

if (!this.originalPos.has(item)) {
  this.originalPos.set(item, {
    left: item.style.left,
    top: item.style.top
  });
}

    item.setPointerCapture(e.pointerId);
    item.classList.add('dragging');

    item.style.position = 'fixed';
    item.style.zIndex = 9999;
  },

  move(e) {
    if (!this.activeItem) return;

    this.activeItem.style.left = `${e.clientX - this.offsetX}px`;
    this.activeItem.style.top  = `${e.clientY - this.offsetY}px`;
  },

  end(e) {
  if (!this.activeItem) return;

  const dragged = this.activeItem;

  // Allow detecting element underneath dragged item
  dragged.style.pointerEvents = 'none';

  const dropZone = document
    .elementFromPoint(e.clientX, e.clientY)
    ?.closest('.drop-zone');

  dragged.style.pointerEvents = '';

  let placed = false;

  // ✅ CORRECT DROP
  if (
    dropZone &&
    DragDrop.canDrop(dropZone) &&
    dragged.dataset.item === dropZone.dataset.accept
  ) {
    DragDrop.placeItem(dragged.dataset.item, dropZone);
    StepController.checkStepCompletion();
    placed = true;
  }

  // 🔁 SNAP BACK IF NOT PLACED
  if (!placed) {
    const pos = this.originalPos.get(dragged);
    dragged.style.left = pos?.left || '';
    dragged.style.top  = pos?.top  || '';
  }

  // Cleanup
  dragged.classList.remove('dragging');
  dragged.style.position = '';
  dragged.style.zIndex = '';
  this.activeItem = null;
}

};

/* ============================================
   Initialization & Events
   ============================================ */
document.addEventListener('DOMContentLoaded', () => {
  UI.init();
  DragDrop.init();
  PointerDrag.init();
  StepController.init();

  UI.startBtn.addEventListener('click', () => {
    StepController.startExperiment();
  });

  UI.resetLandingBtn.addEventListener('click', () => {
    ResetController.resetAll();
  });

  UI.add05mlBtn.addEventListener('click', () => {
    TitrationSimulator.addNaOH(0.5);
  });

  UI.add01mlBtn.addEventListener('click', () => {
    TitrationSimulator.addNaOH(0.1);
  });

  UI.stopBtn.addEventListener('click', () => {
    if (state.titrationActive) TitrationSimulator.completeTitration();
    else ResetController.resetAll();
  });
});
/* ================================
   DROP ZONE HIGHLIGHT HELPERS
   (VISUAL ONLY – SAFE)
   ================================ */

function highlightDropZone(itemName) {
  document.querySelectorAll('.drop-zone').forEach(zone => {
    if (zone.dataset.accept === itemName) {
      zone.classList.add('highlight');
    }
  });
}

function clearDropZoneHighlight() {
  document.querySelectorAll('.drop-zone.highlight').forEach(zone => {
    zone.classList.remove('highlight');
  });
}
