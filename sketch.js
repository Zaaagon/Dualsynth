var context = new AudioContext();
var size = 1024;
var numTables = 2;
var waveTables = [];

var sliderList = [];
var labelList = [];
var volumeList = [];
var volumeLabelList = [];
var oscEnabledList = [];
var toggleButtonList = [];
var fmDepthList = [];
var fmDepthPrev = [];

var isPlaying = false;
var scriptNode = null;
var canvasOffsetX = 0;

function setup() {
  let canvas = createCanvas(600, 350);
  canvas.parent('synth-container');
  pixelDensity(2);
  smooth();

  for (var t = 0; t < numTables; t++) {
    waveTables.push(Array(size).fill(0).map((_, i) => Math.sin(2 * Math.PI * i / (size - 1))));
    fmDepthPrev.push(0);
  }

  // Wait for DOM layout
  setTimeout(() => {
    canvasOffsetX = canvas.elt.getBoundingClientRect().left;
    layoutUI();
  }, 50);
}

function layoutUI() {
  var gap = 20, cols = 2;
  var boxWidth = (width - gap * (cols + 1)) / cols;
  var boxHeight = boxWidth / 2;

  for (var t = 0; t < numTables; t++) {
    var col = t % cols;
    var row = Math.floor(t / cols);
    var x = canvasOffsetX + gap + col * (boxWidth + gap);
    var y = gap + row * (boxHeight + 180) + 40;

    createP("OSC " + (t + 1)).position(x + 10, y - 28).style('color', 'white').style('margin', '0px');

    /*(function(currentT, x, boxWidth, y) {
      var toggleButton = createButton("ON");
      toggleButton.position(x + boxWidth - 50, y - 30);
      oscEnabledList[currentT] = true;
      toggleButton.html("ON");
      toggleButton.mousePressed(function () {
        oscEnabledList[currentT] = !oscEnabledList[currentT];
        toggleButton.html(oscEnabledList[currentT] ? "ON" : "OFF");
      });
      toggleButtonList.push(toggleButton);
    })(t, x, boxWidth, y);*/

    var slider = createSlider(16, 108, 69, 1);
    slider.position(x, y + boxHeight + 10);
    sliderList.push(slider);

    var label = createP("");
    label.position(x + 160, y + boxHeight + 10);
    label.style('color', 'white').style('margin', '0px');
    labelList.push(label);

    var volumeSlider = createSlider(0, 1, 0.5, 0.01);
    volumeSlider.position(x, y + boxHeight + 35);
    volumeList.push(volumeSlider);

    var volumeLabel = createP("0 dB");
    volumeLabel.position(x + 160, y + boxHeight + 35);
    volumeLabel.style('color', 'white').style('margin', '0px');
    volumeLabelList.push(volumeLabel);

    (function(currentT) {
      var normButton = createButton("Normalize");
      normButton.position(x, y + boxHeight + 60);
      normButton.mousePressed(function () {
        normalizeWave(currentT);
      });
    })(t);

    (function(currentT) {
      var smoothButton = createButton("Smooth");
      smoothButton.position(x + 87, y + boxHeight + 60);
      smoothButton.mousePressed(function () {
        lowPassFilter(currentT);
      });
    })(t);

    (function(currentT) {
      var initButton = createButton("Initial");
      initButton.position(x + 160, y + boxHeight + 60);
      initButton.mousePressed(function () {
        resetWave(currentT);
      });
    })(t);

    (function(currentT) {
      var fmDepthLabel = createP("0.0%");
      fmDepthLabel.style('color', 'white').style('margin', '0px');

      var fmDepthSlider = createSlider(0, 100, 0, 0.1);
      fmDepthSlider.position(x, y + boxHeight + 80);
      fmDepthLabel.position(x + fmDepthSlider.width + 80, y + boxHeight + 80);
      fmDepthSlider.style('width', (boxWidth * 0.6) + 'px');
      fmDepthSlider.input(function () {
        fmDepthLabel.html(fmDepthSlider.value().toFixed(1) + "%");
      });
      fmDepthList.push(fmDepthSlider);
    })(t);
  }

  var toggleRealtimeBtn = createButton("Start");
  toggleRealtimeBtn.position(canvasOffsetX + 10, height - 30);
  toggleRealtimeBtn.mousePressed(function () {
    isPlaying = !isPlaying;
    if (isPlaying) {
      startRealtimePlayback();
      toggleRealtimeBtn.html("Stop");
    } else {
      stopRealtimePlayback();
      toggleRealtimeBtn.html("Start");
    }
  });
}

function draw() {
	if (sliderList.length < numTables) return;
  
	background(0);
	var gap = 20, cols = 2;
	var boxWidth = (width - gap * (cols + 1)) / cols;
	var boxHeight = boxWidth / 2;
  
	for (var t = 0; t < numTables; t++) {
	  var col = t % cols;
	  var row = Math.floor(t / cols);
	  var x = gap + col * (boxWidth + gap);
	  var y = gap + row * (boxHeight + 180) + 40;
  
	  stroke(255);
	  noFill();
	  rect(x, y - 40, boxWidth, boxHeight + 140);
  
	  stroke(100);
	  rect(x, y, boxWidth, boxHeight);
  
	  stroke(0, 204, 0);
	  noFill();
	  beginShape();
	  for (var px = 0; px < boxWidth; px++) {
		var index = Math.floor(map(px, 0, boxWidth - 1, 0, size - 1));
		var value = waveTables[t][index];
		var py = y + boxHeight / 2 - value * (boxHeight / 2);
		vertex(x + px, py);
	  }
	  endShape();
  
	  var midi = sliderList[t].value();
	  var freq = midiToFreqNum(midi).toFixed(1);
	  labelList[t].html(midiToNoteName(midi) + " (" + freq + " Hz)");
  
	  var linear = volumeList[t].value();
	  volumeLabelList[t].html(linear === 0 ? "-∞" : Math.round(20 * Math.log10(linear)) + " dB");
	}
  }

function startRealtimePlayback() {
	if (!scriptNode) {
	  var sampleRate = context.sampleRate;
	  scriptNode = context.createScriptProcessor(1024, 0, 1);
	  var phase1 = 0, phase2 = 0;
  
	  scriptNode.onaudioprocess = function (e) {
		var output = e.outputBuffer.getChannelData(0);
		output.fill(0);
  
		if (oscEnabledList[0] && oscEnabledList[1]) {
		  var table1 = waveTables[0];
		  var table2 = waveTables[1];
		  var freq1 = midiToFreqNum(sliderList[0].value());
		  var freq2 = midiToFreqNum(sliderList[1].value());
		  var vol1 = volumeList[0].value();
		  var vol2 = volumeList[1].value();
		  var fmDepth1 = fmDepthList[0].value() / 100;
		  var fmDepth2 = fmDepthList[1].value() / 100;
  
		  for (var i = 0; i < output.length; i++) {
			var modVal2 = interpolate(table2, phase2 % 1);
			var modVal1 = interpolate(table1, phase1 % 1);
  
			var offset1 = Math.tanh(modVal2 * fmDepth1) * 0.5;
			var offset2 = Math.tanh(modVal1 * fmDepth2) * 0.5;
  
			var sample1 = interpolate(table1, (phase1 + offset1 + 1) % 1) * vol1;
			var sample2 = interpolate(table2, (phase2 + offset2 + 1) % 1) * vol2;
  
			output[i] += sample1 + sample2;
  
			phase1 += freq1 / sampleRate;
			phase2 += freq2 / sampleRate;
  
			if (phase1 >= 1) phase1 -= 1;
			if (phase2 >= 1) phase2 -= 1;
		  }
		}
	  };
  
	  scriptNode.connect(context.destination);
	}
}

function stopRealtimePlayback() {
	if (scriptNode) {
		scriptNode.disconnect();
		scriptNode = null;
	}
}

function mouseDragged() {
	handleWaveEdit(mouseX, mouseY);
}

function mousePressed() {
	if (context.state !== 'running') context.resume();
	handleWaveEdit(mouseX, mouseY);
}

function handleWaveEdit(mx, my) {
	var gap = 20, cols = 2;
	var boxWidth = (width - gap * (cols + 1)) / cols;
	var boxHeight = boxWidth / 2;
	var totalWidth = (boxWidth + gap) * cols - gap;
	var offsetX = (width - totalWidth) / 2;

	var brushSize = 5;

	for (var t = 0; t < numTables; t++) {
		var col = t % cols;
		var row = Math.floor(t / cols);
		var x = offsetX + col * (boxWidth + gap);
		var y = gap + row * (boxHeight + 180) + 40;

		if (mx >= x && mx < x + boxWidth && my >= y && my < y + boxHeight) {
			var center = Math.floor((mx - x) / boxWidth * size);
			var val = constrain(map(my - y, boxHeight, 0, -1, 1), -1, 1);
			for (var i = -brushSize; i <= brushSize; i++) {
				var idx = center + i;
				if (idx >= 0 && idx < size) waveTables[t][idx] = val;
			}
		}
	}
}

function interpolate(table, phase) {
	var index = phase * (size - 1);
	var i0 = Math.floor(index);
	var i1 = Math.min(i0 + 1, size - 1);
	var frac = index - i0;
	return table[i0] * (1 - frac) + table[i1] * frac;
}

function normalizeWave(index) {
	var table = waveTables[index];
	var maxVal = Math.max.apply(null, table.map(Math.abs));
	if (maxVal > 0) {
		for (var i = 0; i < size; i++) table[i] /= maxVal;
	}
}

function lowPassFilter(index, kernelSize) {
	if (kernelSize === undefined) kernelSize = 10;
	var table = waveTables[index];
	var half = Math.floor(kernelSize / 2);
	var smoothed = new Array(size).fill(0);
	for (var i = 0; i < size; i++) {
		var sum = 0, count = 0;
		for (var j = -half; j <= half; j++) {
			var idx = i + j;
			if (idx >= 0 && idx < size) {
				sum += table[idx];
				count++;
			}
		}
		smoothed[i] = sum / count;
	}
	waveTables[index] = smoothed;
}

function resetWave(index) {
	for (var i = 0; i < size; i++) {
		waveTables[index][i] = Math.sin(2 * Math.PI * i / (size - 1));
	}
}

function midiToFreqNum(note) {
	return 440 * Math.pow(2, (note - 69) / 12);
}

function midiToNoteName(note) {
	var names = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
	return names[note % 12] + (Math.floor(note / 12) - 1);
}