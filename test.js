madge('path/to/entry.js').then((res) => {
  const dot = res.dot();

  // Modify node labels in the DOT output
  const newDot = dot.replace(
    /^(".*?")\s*;\s*$/gm, // Match standalone nodes
    (match, nodeId) => `${nodeId} [label="${shrinkPath(JSON.parse(nodeId))}"];`
  ).replace(
    /^(".*?")\s*->\s*(".*?");/gm, // Match edges
    (match, from, to) => `${from} -> ${to};`
  );

  fs.writeFileSync('graph.dot', newDot);
});
