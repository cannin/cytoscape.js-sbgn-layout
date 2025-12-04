/**
 * Mapping between SBGN glyps and Reactome element types
 */
let mapping = {};

mapping.isSbgnGlyph = function(glyph) {
  const sbgnGlyphs = ["unspecified entitiy", "simple chemical", "macromolecule", "nucleic acid feature", "complex", "empty set", "source and sink", "perturbing agent", "simple chemical multimer", "macromolecule multimer", "nucleic acid feature multimer", "complex multimer", "compartment", "process", "omitted process", "uncertain process", "association", "dissociation", "phenotype", "and", "or", "not", "equivalence", "tag", "submap"];
  return sbgnGlyphs.includes(glyph);
};

mapping.getGlyph = function(classes) {
  if (classes.includes("Protein")) return "macromolecule";
  if (classes.includes("Complex")) return "complex";
  if (classes.includes("Chemical")) return "simple chemical";
  if (classes.includes("Compartment")) return "compartment";
  if (classes.includes("dissociation")) return "dissociation";
  if (classes.includes("association")) return "association";
  if (classes.includes("transition")) return "process";

  return "unspecified entity";
};

module.exports = mapping;