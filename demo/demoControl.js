const cytoscape = require('cytoscape');
const convert = require('sbgnml-to-cytoscape');
const sbgnStylesheet = require('cytoscape-sbgn-stylesheet');
const sbgnLayout = require('../dist/cytoscape-sbgn-layout.umd.js');

sbgnLayout(cytoscape);

let cy = window.cy = cytoscape({
	container: document.getElementById('cy'),
	style: sbgnStylesheet(cytoscape)
});

let cyGraph = null;

let loadSample = function (fname) {
	cy.remove(cy.elements());
	fetch(fname).then(function (res) {
		return res.text();
	}).then(function (data) {
		cyGraph = convert(data);
		cy.add(cyGraph);
		cy.layout({ name: 'preset' }).run();

		cy.nodes().forEach(node => {			
			let bbox = node.data('bbox');
			node.css('width', bbox.w);
			node.css('height', bbox.h);
			node.css('font-size', 11);
			node.position({x: bbox.x, y: bbox.y});
			if(node.data("class") == "process" || node.data("class") == "omitted process" || node.data("class") == "uncertain process" || node.data("class") == "association" || node.data("class") == "dissociation") {
				if(node.css("content")) {
					node.css("content", ".");
				}
			}
			if(node.data("class") != "compartment" && node.data("class") != "complex") {
				node.css('padding', 0);
			} else if (node.data("class") == "complex") {
				if (node.children().length > 0) {
					node.css('padding', 10);
				} else {
					node.css('padding', 0);
				}
			}
		});
		cy.fit(cy.elements(), 30);
	});
};

document.getElementById("samples").addEventListener("change", function (event) {
	let sample = event.target.value;
	let filename = "";
	if(sample == "sample1") {
		filename = "R-HSA-5652084.sbgn";
	}
	else if(sample == "sample2") {
		filename = "R-HSA-70370.sbgn";
	}
	else if(sample == "sample3") {
		filename = "R-HSA-72764.sbgn";
	}
	else if(sample == "sample4") {
		filename = "glycolysis.sbgn";
	}
	else if(sample == "sample5") {
		filename = "vitamins_b6_activation_to_pyridoxal_phosphate.sbgn";
	}
	else if(sample == "sample6") {
		filename = "R-HSA-70326.sbgn";
	}
	else if(sample == "sample7") {
		filename = "Artemether_Metabolism_Pathway.xml";
	}
	else if(sample == "sample8") {
		filename = "Aminobutyrate_degradation.xml";
	}
	else if(sample == "sample9") {
		filename = "Formation_of_the_Editosome.xml";
	}
	else if(sample == "sample10") {
		filename = "Ketone_body_catabolism.sbgn";
	}
	else if(sample == "sample11") {
		filename = "activated_stat1alpha_induction_of_the_irf1_gene.sbgn";
	}
	else if(sample == "sample12") {
		filename = "Riboflavin_Metabolism_toBeSolved.sbgn";
	}
	else if(sample == "sample13") {
		filename = "Synthesis_of_Ketone_Bodies.sbgn";
	}
	else if(sample == "sample14") {
		filename = "glycolysis_cropped.sbgn";
	}
	else if(sample == "sample15") {
		filename = "WP121.sbgn";
	}
	else if(sample == "sample16") {
		filename = "Beta_oxidation_of_hexanoyl-CoA_to_butanoyl-CoA.xml";
	}
	loadSample('examples/' + filename);
	document.getElementById("fileName").innerHTML = filename;
});

document.getElementById("randomizeButton").addEventListener("click", function () {
	cy.layout({name: "random"}).run();
});

document.getElementById("layoutButton").addEventListener("click", function () {
	cy.layout({
		name: "sbgn-layout",
		randomize: !document.getElementById("randomize").checked
	}).run();
});