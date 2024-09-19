@@ -6,16 +6,17 @@
 
 // Global color definitions
 const highlightColor = "#9370DB";
 const defaultColor = "#A9A9A9";
+const nodeColor = "#6495ED";
 
 let links = null;
 let nodes = null;
 let simulation = null;
 let selectedNode = null;
-let svg = null;
-let g = null;
-let zoom = null;
+let canvas = null;
+let ctx = null;
+let transform = d3.zoomIdentity;
 
 let worker = new Worker('dataworker.js');
 
 worker.onmessage = function(event) {
@@ -30,277 +31,223 @@
     worker.postMessage({ type: 'loadData', url: url });
 }
 
 function createD3Graph(graph, parentWidth, parentHeight) {
-    svg = d3.select('svg')
+    canvas = d3.select('#graph')
         .attr('width', parentWidth)
-        .attr('height', parentHeight);
+        .attr('height', parentHeight)
+        .node();
 
-    // Remove any previous graphs
-    svg.selectAll('*').remove();
+    ctx = canvas.getContext('2d');
 
-    // Add arrow definitions
-    const defs = svg.append("defs");
-
-    // Default arrow
-    defs.append("marker")
-        .attr("id", "arrowhead-default")
-        .attr("viewBox", "-0 -5 10 10")
-        .attr("refX", 10)
-        .attr("refY", 0)
-        .attr("orient", "auto")
-        .attr("markerWidth", 12)
-        .attr("markerHeight", 12)
-        .attr("xoverflow", "visible")
-        .append("svg:path")
-        .attr("d", "M 0,-5 L 10 ,0 L 0,5")
-        .attr("fill", "#A9A9A9")
-        .attr("stroke", "none");
-
-    defs.append("marker")
-        .attr("id", "arrowhead-highlight")
-        .attr("viewBox", "-0 -5 10 10")
-        .attr("refX", 10)
-        .attr("refY", 0)
-        .attr("orient", "auto")
-        .attr("markerWidth", 12)
-        .attr("markerHeight", 12)
-        .attr("xoverflow", "visible")
-        .append("svg:path")
-        .attr("d", "M 0,-5 L 10 ,0 L 0,5")
-        .attr("fill", "#9370DB")
-        .attr("stroke", "none");
-
-    g = svg.append('g');
-
-    // Create zoom behavior
-    zoom = d3.zoom()
-        .scaleExtent([0.1, 4])
-        .on('zoom', (event) => {
-            g.attr('transform', event.transform);
-        });
-
-    svg.call(zoom);
-
     // Calculate node sizes based on connections
     const nodeSize = d3.scaleLinear()
         .domain([0, d3.max(graph.nodes, d => d.connections)])
         .range([5, 20]);
 
-    // Create links
-    links = g.append("g")
-        .selectAll("line")
-        .data(graph.links)
-        .join("line")
-        .attr("stroke", "#A9A9A9")
-        .attr("stroke-opacity", 0.6)
-        .attr("stroke-width", 0.5)
-        .attr("marker-end", "url(#arrowhead-default)");  // Add arrowhead
+    // Create nodes and links
+    nodes = graph.nodes.map(d => ({...d, r: nodeSize(d.connections)}));
+    links = graph.links.map(d => ({...d}));
 
-    // Create nodes
-    nodes = g.append("g")
-        .selectAll("circle")
-        .data(graph.nodes)
-        .join("circle")
-        .attr("r", d => nodeSize(d.connections))
-        .attr("fill", "#6495ED")
-        .call(drag(simulation))
-        .on("click", (event, d) => setSelectedNode(d));
-
-    // Add labels to nodes
-    const labels = g.append("g")
-        .selectAll("text")
-        .data(graph.nodes)
-        .join("text")
-        .text(d => d.name)
-        .attr("font-size", "12px")
-        .attr("font-family", "Arial, Helvetica, sans-serif")
-        .attr("dx", 12)
-        .attr("dy", ".35em")
-        .attr("pointer-events", "none");  // Prevent labels from interfering with node interactions
-
     // Create simulation
-    simulation = d3.forceSimulation(graph.nodes)
-        .force("link", d3.forceLink(graph.links).id(d => d.id).distance(100))
+    simulation = d3.forceSimulation(nodes)
+        .force("link", d3.forceLink(links).id(d => d.id).distance(100))
         .force("charge", d3.forceManyBody().strength(-300))
         .force("center", d3.forceCenter(parentWidth / 2, parentHeight / 2))
-        .force("collision", d3.forceCollide().radius(d => nodeSize(d.connections) + 10))
+        .force("collision", d3.forceCollide().radius(d => d.r + 10))
         .on("tick", ticked);
 
-    function ticked() {
-        links
-            .attr("x1", d => d.source.x)
-            .attr("y1", d => d.source.y)
-            .attr("x2", d => {
-                const dx = d.target.x - d.source.x;
-                const dy = d.target.y - d.source.y;
-                const length = Math.sqrt(dx * dx + dy * dy);
-                const scale = (length - nodeSize(d.target.connections)) / length;
-                return d.source.x + dx * scale;
-            })
-            .attr("y2", d => {
-                const dx = d.target.x - d.source.x;
-                const dy = d.target.y - d.source.y;
-                const length = Math.sqrt(dx * dx + dy * dy);
-                const scale = (length - nodeSize(d.target.connections)) / length;
-                return d.source.y + dy * scale;
-            });
+    // Set up zoom behavior
+    const zoom = d3.zoom()
+        .scaleExtent([0.1, 4])
+        .on("zoom", zoomed);
 
-        nodes
-            .attr("cx", d => d.x)
-            .attr("cy", d => d.y);
+    d3.select(canvas)
+        .call(zoom)
+        .on("dblclick.zoom", null);
 
-        labels
-            .attr("x", d => d.x + 8)
-            .attr("y", d => d.y);
-    }
-
     // Add search functionality
     d3.select("#search").on("input", function() {
         const searchTerm = this.value.toLowerCase();
         if (searchTerm) {
-            highlightNodes(searchTerm, graph.nodes, nodes, links, labels);
+            highlightNodes(searchTerm);
         } else {
-            resetGraph(nodes, links, labels);
+            resetGraph();
         }
     });
 
     // Add click event to reset graph when clicking on empty space
-    svg.on("click", function(event) {
-        if (event.target === this) {
+    d3.select(canvas).on("click", function(event) {
+        const [x, y] = d3.pointer(event);
+        const node = findNodeAtPosition(x, y);
+        if (!node) {
             d3.select("#search").property("value", "");
-            resetGraph(nodes, links, labels);
+            resetGraph();
             selectedNode = null;
+        } else {
+            setSelectedNode(node);
         }
+    });
 
+    // Add mousemove event for hover effect
+    d3.select(canvas).on("mousemove", function(event) {
+        const [x, y] = d3.pointer(event);
+        const node = findNodeAtPosition(x, y);
+        this.style.cursor = node ? "pointer" : "default";
     });
+}
 
-    // Add mouseover and mouseout events for nodes
-    nodes
-        .on("mouseover", function(event, d) {
-            d3.select(this).attr("fill", "#FFA07A");  // Change color on hover
-            d3.select(this.parentNode).raise();  // Bring node to front
-        })
-        .on("mouseout", function(event, d) {
-            if (selectedNode !== d) {
-                d3.select(this).attr("fill", "#6495ED");  // Revert color if not selected
-            }
-        });
+function ticked() {
+    ctx.save();
+    ctx.clearRect(0, 0, canvas.width, canvas.height);
+    ctx.translate(transform.x, transform.y);
+    ctx.scale(transform.k, transform.k);
+
+    // Draw links
+    ctx.strokeStyle = defaultColor;
+    ctx.lineWidth = 0.5;
+    links.forEach(drawLink);
+
+    // Draw nodes
+    nodes.forEach(drawNode);
+
+    // Draw labels
+    ctx.font = "12px Arial";
+    ctx.textAlign = "left";
+    ctx.textBaseline = "middle";
+    nodes.forEach(drawLabel);
+
+    ctx.restore();
 }
 
-function highlightNodes(searchTerm, allNodes, nodes, links, labels) {
-    const matchedNodes = allNodes.filter(n => n.name.toLowerCase().includes(searchTerm));
+function drawLink(d) {
+    ctx.beginPath();
+    ctx.moveTo(d.source.x, d.source.y);
+    ctx.lineTo(d.target.x, d.target.y);
+    ctx.stroke();
+}
 
+function drawNode(d) {
+    ctx.beginPath();
+    ctx.moveTo(d.x + d.r, d.y);
+    ctx.arc(d.x, d.y, d.r, 0, 2 * Math.PI);
+    ctx.fillStyle = d === selectedNode ? highlightColor : nodeColor;
+    ctx.fill();
+}
+
+function drawLabel(d) {
+    ctx.fillStyle = "black";
+    ctx.fillText(d.name, d.x + d.r + 2, d.y);
+}
+
+function zoomed(event) {
+    transform = event.transform;
+    ticked();
+}
+
+function highlightNodes(searchTerm) {
+    const matchedNodes = nodes.filter(n => n.name.toLowerCase().includes(searchTerm));
+
     if (matchedNodes.length === 0) {
-        resetGraph(nodes, links, labels);
+        resetGraph();
         return;
     }
 
     const connectedNodes = new Set(matchedNodes.map(n => n.id));
     const connectedLinks = new Set();
 
-    links.each(function(d) {
+    links.forEach(d => {
         if (matchedNodes.some(n => n.id === d.source.id || n.id === d.target.id)) {
             connectedNodes.add(d.source.id);
             connectedNodes.add(d.target.id);
             connectedLinks.add(d);
         }
     });
 
-    nodes.attr("fill", d => matchedNodes.some(n => n.id === d.id) ? highlightColor : (connectedNodes.has(d.id) ? highlightColor : "#D3D3D3"))
-         .attr("opacity", d => connectedNodes.has(d.id) ? 1 : 0.1);
+    nodes.forEach(d => {
+        d.highlighted = matchedNodes.some(n => n.id === d.id) || connectedNodes.has(d.id);
+        d.opacity = d.highlighted ? 1 : 0.1;
+    });
 
-    links.attr("stroke", d => connectedLinks.has(d) ? highlightColor : defaultColor)
-         .attr("opacity", d => connectedLinks.has(d) ? 1 : 0.1)
-         .attr("marker-end", d => connectedLinks.has(d) ? "url(#arrowhead-highlight)" : "url(#arrowhead-default)");
+    links.forEach(d => {
+        d.highlighted = connectedLinks.has(d);
+        d.opacity = d.highlighted ? 1 : 0.1;
+    });
 
-    labels.attr("opacity", d => connectedNodes.has(d.id) ? 1 : 0.1);
-
     // Zoom to the first matched node
     if (matchedNodes.length > 0) {
         zoomToNode(matchedNodes[0]);
     }
+
+    ticked();
 }
 
 function setSelectedNode(node) {
     if (selectedNode === node) return;
 
     const connectedNodes = new Set([node.id]);
     const connectedLinks = new Set();
 
-    links.each(function(d) {
+    links.forEach(d => {
         if (d.source.id === node.id || d.target.id === node.id) {
             connectedNodes.add(d.source.id);
             connectedNodes.add(d.target.id);
             connectedLinks.add(d);
         }
     });
 
-    nodes.attr("fill", d => d.id === node.id ? "#9370DB" : (connectedNodes.has(d.id) ? "#9370DB" : "#6495ED"))
-         .attr("opacity", d => connectedNodes.has(d.id) ? 1 : 0.1);
+    nodes.forEach(d => {
+        d.highlighted = d.id === node.id || connectedNodes.has(d.id);
+        d.opacity = d.highlighted ? 1 : 0.1;
+    });
 
-    links.attr("stroke", d => connectedLinks.has(d) ? highlightColor : defaultColor)
-         .attr("opacity", d => connectedLinks.has(d) ? 1 : 0.1)
-         .attr("marker-end", d => connectedLinks.has(d) ? "url(#arrowhead-highlight)" : "url(#arrowhead-default)");
+    links.forEach(d => {
+        d.highlighted = connectedLinks.has(d);
+        d.opacity = d.highlighted ? 1 : 0.1;
+    });
 
-    labels.attr("opacity", d => connectedNodes.has(d.id) ? 1 : 0.1);
-
     selectedNode = node;
     console.log("Selected node:", node.name);
 
     // Zoom to the selected node
     zoomToNode(node);
+
+    ticked();
 }
 
-function resetGraph(nodes, links, labels) {
-    nodes.attr("fill", "#6495ED")
-         .attr("opacity", 1);
-    links.attr("stroke", "#A9A9A9")
-         .attr("opacity", 0.6)
-         .attr("marker-end", "url(#arrowhead-default)");
-    labels.attr("opacity", 1);
+function resetGraph() {
+    nodes.forEach(d => {
+        d.highlighted = false;
+        d.opacity = 1;
+    });
+
+    links.forEach(d => {
+        d.highlighted = false;
+        d.opacity = 1;
+    });
+
+    selectedNode = null;
+    ticked();
 }
 
 function zoomToNode(node) {
     const scale = 1;
-    const x = -node.x * scale + svg.attr("width") / 2;
-    const y = -node.y * scale + svg.attr("height") / 2;
+    const x = -node.x * scale + canvas.width / 2;
+    const y = -node.y * scale + canvas.height / 2;
 
-    svg.transition()
-        .duration(500)
-        .call(zoom.transform, d3.zoomIdentity.translate(x, y).scale(scale));
+    transform = d3.zoomIdentity.translate(x, y).scale(scale);
+    d3.select(canvas).transition().duration(500).call(d3.zoom().transform, transform);
 }
 
- function resetZoom() {
-    svg.transition()
-        .duration(500)
-        .call(zoom.transform, d3.zoomIdentity);
+function findNodeAtPosition(x, y) {
+    const invertedPoint = transform.invert([x, y]);
+    return nodes.find(node => {
+        const dx = invertedPoint[0] - node.x;
+        const dy = invertedPoint[1] - node.y;
+        return dx * dx + dy * dy < node.r * node.r;
+    });
 }
 
-function drag(simulation) {
-    function dragstarted(event) {
-        if (!event.active) simulation.alphaTarget(0.3).restart();
-        event.subject.fx = event.subject.x;
-        event.subject.fy = event.subject.y;
-    }
-
-    function dragged(event) {
-        event.subject.fx = event.x;
-        event.subject.fy = event.y;
-    }
-
-    function dragended(event) {
-        if (!event.active) simulation.alphaTarget(0);
-        event.subject.fx = null;
-        event.subject.fy = null;
-    }
-
-    return d3.drag()
-        .on("start", dragstarted)
-        .on("drag", dragged)
-        .on("end", dragended);
-}
-
 // Usage
 if (isBrowser) {
     document.addEventListener("DOMContentLoaded", function() {
         loadGraphData('merged20240726.csv');