#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const cytoscape = require('cytoscape');
const sbgnLayout = require('../dist/cytoscape-sbgn-layout.umd.js');
const sbgnmlToCytoscape = require('sbgnml-to-cytoscape');
const xmljs = require('xml-js');
const layoutBase = require('layout-base');

const DEFAULTS = {
  randomize: true,
  idealEdgeLength: 75,
  mapType: 'PD',
  slopeThreshold: 0.5
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const patchGridBounds = () => {
  const fdProto = layoutBase.FDLayout.prototype;
  if (fdProto.__sbgn_layout_cli_patched) {
    return;
  }

  fdProto.__sbgn_layout_cli_patched = true;
  fdProto.addNodeToGrid = function addNodeToGridPatched(v, left, top) {
    if (!this.grid || this.grid.length === 0 || !this.grid[0] || this.grid[0].length === 0) {
      return;
    }

    const maxX = this.grid.length - 1;
    const maxY = this.grid[0].length - 1;

    let startX = Math.floor((v.getRect().x - left) / this.repulsionRange);
    let finishX = Math.floor((v.getRect().width + v.getRect().x - left) / this.repulsionRange);
    let startY = Math.floor((v.getRect().y - top) / this.repulsionRange);
    let finishY = Math.floor((v.getRect().height + v.getRect().y - top) / this.repulsionRange);

    startX = clamp(startX, 0, maxX);
    finishX = clamp(finishX, 0, maxX);
    startY = clamp(startY, 0, maxY);
    finishY = clamp(finishY, 0, maxY);

    for (let i = startX; i <= finishX; i += 1) {
      for (let j = startY; j <= finishY; j += 1) {
        this.grid[i][j].push(v);
      }
    }

    v.setGridCoordinates(startX, finishX, startY, finishY);
  };
};

const HELP_TEXT = `
Usage:
  node cli/sbgn_layout_cli.js --input INPUT.sbgn --output OUTPUT.sbgn [options]

Options:
  --input, -i              Input SBGNML file path.
  --output, -o             Output SBGNML file path.
  --randomize              Start layout from random positions (default).
  --no-randomize           Start layout from input coordinates.
  --ideal-edge-length NUM  Ideal edge length (default: ${DEFAULTS.idealEdgeLength}).
  --map-type TYPE          Map type (PD or AF). Default: ${DEFAULTS.mapType}.
  --slope-threshold NUM    Slope threshold for polishing (default: ${DEFAULTS.slopeThreshold}).
  --help, -h               Show this help.

Notes:
  - Updates glyph bbox (x/y/w/h) and port positions. Arc bendpoints are preserved.
`;

const toNumber = (value, fallback) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const ensureArray = (value) => {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
};

const parseArgs = (argv) => {
  const options = {
    input: null,
    output: null,
    randomize: DEFAULTS.randomize,
    idealEdgeLength: DEFAULTS.idealEdgeLength,
    mapType: DEFAULTS.mapType,
    slopeThreshold: DEFAULTS.slopeThreshold
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      break;
    }
    if (arg === '--input' || arg === '-i') {
      options.input = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--output' || arg === '-o') {
      options.output = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--randomize') {
      options.randomize = true;
      continue;
    }
    if (arg === '--no-randomize') {
      options.randomize = false;
      continue;
    }
    if (arg === '--ideal-edge-length') {
      options.idealEdgeLength = toNumber(argv[i + 1], DEFAULTS.idealEdgeLength);
      i += 1;
      continue;
    }
    if (arg === '--map-type') {
      options.mapType = (argv[i + 1] || DEFAULTS.mapType).toUpperCase();
      i += 1;
      continue;
    }
    if (arg === '--slope-threshold') {
      options.slopeThreshold = toNumber(argv[i + 1], DEFAULTS.slopeThreshold);
      i += 1;
    }
  }

  return options;
};

const readSbgnml = (inputPath) => fs.readFileSync(inputPath, 'utf8');

const parseSbgnml = (text) => xmljs.xml2js(text, {
  compact: true,
  spaces: 2,
  trim: true,
  nativeType: true
});

const getBbox = (glyph) => {
  const attrs = glyph && glyph.bbox && glyph.bbox._attributes ? glyph.bbox._attributes : null;
  if (!attrs) {
    return null;
  }
  const x = toNumber(attrs.x, 0);
  const y = toNumber(attrs.y, 0);
  const w = toNumber(attrs.w, 0);
  const h = toNumber(attrs.h, 0);
  return { x, y, w, h };
};

const setBbox = (glyph, bbox) => {
  if (!glyph.bbox) {
    glyph.bbox = { _attributes: {} };
  }
  if (!glyph.bbox._attributes) {
    glyph.bbox._attributes = {};
  }
  glyph.bbox._attributes.x = bbox.x;
  glyph.bbox._attributes.y = bbox.y;
  glyph.bbox._attributes.w = bbox.w;
  glyph.bbox._attributes.h = bbox.h;
};

const updateGlyphs = (glyphs, positions) => {
  ensureArray(glyphs).forEach((glyph) => {
    if (!glyph || !glyph._attributes) {
      return;
    }
    const glyphId = glyph._attributes.id;
    const oldBbox = getBbox(glyph);
    if (glyphId && oldBbox && positions.has(glyphId)) {
      const newPos = positions.get(glyphId);
      const oldCenter = {
        x: oldBbox.x + oldBbox.w / 2,
        y: oldBbox.y + oldBbox.h / 2
      };
      const newBbox = {
        x: newPos.x - oldBbox.w / 2,
        y: newPos.y - oldBbox.h / 2,
        w: oldBbox.w,
        h: oldBbox.h
      };
      setBbox(glyph, newBbox);

      const ports = ensureArray(glyph.port);
      ports.forEach((port) => {
        if (!port || !port._attributes) {
          return;
        }
        const portX = toNumber(port._attributes.x, null);
        const portY = toNumber(port._attributes.y, null);
        if (portX === null || portY === null) {
          return;
        }
        const offsetX = portX - oldCenter.x;
        const offsetY = portY - oldCenter.y;
        port._attributes.x = newPos.x + offsetX;
        port._attributes.y = newPos.y + offsetY;
      });
    }

    const children = ensureArray(glyph.glyph);
    if (children.length > 0) {
      updateGlyphs(children, positions);
    }
  });
};

const buildPositions = (cy) => {
  const positions = new Map();
  cy.nodes().forEach((node) => {
    const pos = node.position();
    positions.set(node.id(), { x: pos.x, y: pos.y });
  });
  return positions;
};

const setupCytoscape = (elements) => {
  sbgnLayout(cytoscape);

  const cy = cytoscape({
    headless: true,
    elements,
    style: [
      {
        selector: 'node',
        style: {
          width: 'data(width)',
          height: 'data(height)',
          padding: 0
        }
      }
    ]
  });

  cy.nodes().forEach((node) => {
    const bbox = node.data('bbox');
    if (bbox) {
      node.position({ x: bbox.x, y: bbox.y });
    }
  });

  cy.nodes().forEach((node) => {
    const cls = node.data('class');
    if (cls !== 'compartment' && cls !== 'complex') {
      node.css('padding', 0);
      return;
    }
    if (cls === 'complex') {
      if (node.children().length > 0) {
        node.css('padding', 10);
      } else {
        node.css('padding', 0);
      }
    }
  });

  return cy;
};

const runLayout = async (cy, options) => {
  const boundingBox = computeBoundingBox(cy);
  const layout = cy.layout({
    name: 'sbgn-layout',
    animate: false,
    randomize: options.randomize,
    idealEdgeLength: options.idealEdgeLength,
    mapType: options.mapType,
    slopeThreshold: options.slopeThreshold,
    boundingBox,
    fit: false
  });

  await new Promise((resolve) => {
    layout.on('layoutstop', resolve);
    layout.run();
  });
};

const computeBoundingBox = (cy) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  cy.nodes().forEach((node) => {
    const pos = node.position();
    const width = toNumber(node.data('width'), 0);
    const height = toNumber(node.data('height'), 0);
    const x1 = pos.x - width / 2;
    const y1 = pos.y - height / 2;
    const x2 = pos.x + width / 2;
    const y2 = pos.y + height / 2;
    if (Number.isFinite(x1) && Number.isFinite(y1) && Number.isFinite(x2) && Number.isFinite(y2)) {
      minX = Math.min(minX, x1);
      minY = Math.min(minY, y1);
      maxX = Math.max(maxX, x2);
      maxY = Math.max(maxY, y2);
    }
  });

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return { x1: 0, y1: 0, x2: 1000, y2: 1000, w: 1000, h: 1000 };
  }

  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);
  return {
    x1: minX,
    y1: minY,
    x2: minX + width,
    y2: minY + height,
    w: width,
    h: height
  };
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.input || !options.output) {
    process.stdout.write(HELP_TEXT);
    process.exit(options.help ? 0 : 1);
  }

  patchGridBounds();

  const inputPath = path.resolve(options.input);
  const outputPath = path.resolve(options.output);

  const sbgnText = readSbgnml(inputPath);
  const sbgnObject = parseSbgnml(sbgnText);

  const graph = sbgnmlToCytoscape(sbgnText);
  const nodes = graph.nodes.map((node) => {
    const bbox = node.data && node.data.bbox ? node.data.bbox : { w: 40, h: 40, x: 0, y: 0 };
    return {
      data: {
        ...node.data,
        width: bbox.w,
        height: bbox.h
      }
    };
  });
  const elements = {
    nodes,
    edges: graph.edges
  };

  const cy = setupCytoscape(elements);
  await runLayout(cy, options);
  const positions = buildPositions(cy);

  const map = sbgnObject.sbgn && sbgnObject.sbgn.map ? sbgnObject.sbgn.map : null;
  if (!map) {
    throw new Error('SBGNML does not contain sbgn.map');
  }

  updateGlyphs(map.glyph, positions);

  const outputXml = xmljs.js2xml(sbgnObject, {
    compact: true,
    spaces: 2
  });
  fs.writeFileSync(outputPath, outputXml, 'utf8');
};

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
