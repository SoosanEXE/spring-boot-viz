import Parser from "tree-sitter";
import Java from "tree-sitter-java";
import fs from "fs";
import path from "path";
import dotPkg from "graphlib-dot";
import pkg from "graphlib";
const { Graph, alg } = pkg;
const { write } = dotPkg;

function parseFile(filepath) {
  const parser = new Parser();
  parser.setLanguage(Java);
  const code = fs.readFileSync(filepath, "utf8");
  const tree = parser.parse(code);
  return { tree, code };
}

function getAllJavaFiles(dir) {
  let javaFiles = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      javaFiles = javaFiles.concat(getAllJavaFiles(fullPath));
    } else if (entry.isFile() && fullPath.endsWith(".java")) {
      javaFiles.push(fullPath);
    }
  }

  return javaFiles;
}

function getClassOrInterfaceName(root) {
  const node =
    root.descendantsOfType("class_declaration")[0] ||
    root.descendantsOfType("interface_declaration")[0];
  return node?.childForFieldName("name")?.text;
}

function getAnnotations(root) {
  return root
    .descendantsOfType("marker_annotation")
    .map((a) => a.firstNamedChild.text);
}

function getAnnotationArguments(code, root, target) {
  const matches = [];
  const annots = root.descendantsOfType("normal_annotation");

  for (const annot of annots) {
    const name = annot.childForFieldName("name")?.text;
    if (name === target) {
      const args = annot.descendantsOfType("string_literal");
      args.forEach((arg) => {
        matches.push(code.slice(arg.startIndex + 1, arg.endIndex - 1));
      });
    }
  }
  return matches;
}

function getAutowiredFields(root) {
  return root
    .descendantsOfType("field_declaration")
    .filter((f) => f.text.includes("@Autowired"))
    .map((f) => f.descendantsOfType("type_identifier")[0]?.text);
}

function getAutowiredSetters(root) {
  return root
    .descendantsOfType("method_declaration")
    .filter((m) => m.text.includes("@Autowired"))
    .map((m) => m.descendantsOfType("type_identifier")[0]?.text);
}

function getSetterInjectedFields(root) {
  return root
    .descendantsOfType("field_declaration")
    .map((f) => f.descendantsOfType("type_identifier")[0]?.text);
}

function getNonNullFields(root) {
  return root
    .descendantsOfType("field_declaration")
    .filter((f) => f.text.includes("@NonNull"))
    .map((f) => f.descendantsOfType("type_identifier")[0]?.text);
}

function getAllFields(root) {
  return root
    .descendantsOfType("field_declaration")
    .map((f) => f.descendantsOfType("type_identifier")[0]?.text);
}

function getConstructorParams(root) {
  const className = getClassOrInterfaceName(root);
  const constructors = root
    .descendantsOfType("constructor_declaration")
    .filter((c) => c.childForFieldName("name")?.text === className);

  return constructors.flatMap((c) =>
    c
      .descendantsOfType("formal_parameter")
      .map((p) => p.descendantsOfType("type_identifier")[0]?.text)
      .filter(Boolean)
  );
}

function getImportedDependencies(code, root) {
  return getAnnotationArguments(code, root, "Import");
}

function getComponentScannedPackages(code, root) {
  return getAnnotationArguments(code, root, "ComponentScan");
}

function isRepositoryInterface(root, code) {
  const isInterface =
    root.descendantsOfType("interface_declaration").length > 0;
  const name = getClassOrInterfaceName(root);
  const hasAnnotation = getAnnotations(root).includes("Repository");
  return (
    isInterface && (hasAnnotation || (name && name.endsWith("Repository")))
  );
}

function getRepoGenericTypes(root) {
  const typeArguments = root.descendantsOfType("type_arguments")[0];
  return typeArguments.namedChildren
    .map((child) =>
      child.type === "scoped_type_identifier"
        ? child.lastNamedChild.text
        : child.text
    )
    .filter(Boolean);
}

function parseAllFiles(allFiles) {
  const allParsed = [];
  for (const file of allFiles) {
    const { tree, code } = parseFile(file);
    const root = tree.rootNode;
    const className = getClassOrInterfaceName(root);
    if (!className) continue;
    allParsed.push({ root, code, className });
  }

  return allParsed;
}

function buildDependencyMap(dir) {
  const depsMap = {};
  const componentScanMap = {};
  const allFiles = getAllJavaFiles(dir);
  const allParsed = parseAllFiles(allFiles);

  for (const { root, code, className } of allParsed) {
    if (!depsMap[className]) depsMap[className] = new Set();
    const annotations = getAnnotations(root);

    if (annotations.includes("RequiredArgsConstructor")) {
      getNonNullFields(root).forEach((d) => {
        if (allParsed.some((p) => p.className === d)) {
          depsMap[className].add(d);
        }
      });
    }

    if (annotations.includes("AllArgsConstructor")) {
      getAllFields(root).forEach((d) => {
        if (allParsed.some((p) => p.className === d)) {
          depsMap[className].add(d);
        }
      });
    }

    if (annotations.includes("Setter")) {
      getSetterInjectedFields(root).forEach((d) => {
        if (allParsed.some((p) => p.className === d)) {
          depsMap[className].add(d);
        }
      });
    }

    getAutowiredFields(root).forEach((d) => {
      if (allParsed.some((p) => p.className === d)) {
        depsMap[className].add(d);
      }
    });

    getAutowiredSetters(root).forEach((d) => {
      if (allParsed.some((p) => p.className === d)) {
        depsMap[className].add(d);
      }
    });

    getConstructorParams(root).forEach((d) => {
      if (allParsed.some((p) => p.className === d)) {
        depsMap[className].add(d);
      }
    });

    getImportedDependencies(code, root).forEach((d) => {
      if (allParsed.some((p) => p.className === d)) {
        depsMap[className].add(d);
      }
    });

    const scannedPkgs = getComponentScannedPackages(code, root);
    if (scannedPkgs.length) {
      componentScanMap[className] = scannedPkgs;
    }

    if (isRepositoryInterface(root, code)) {
      getRepoGenericTypes(root).forEach((d) => {
        if (allParsed.some((p) => p.className === d)) {
          depsMap[className].add(d);
        }
      });
    }
  }
  const depsMapArray = {};
  for (const [cls, depsSet] of Object.entries(depsMap)) {
    depsMapArray[cls] = Array.from(depsSet);
  }
  return depsMapArray;
}

function toDot(depsMap) {
  const g = new Graph({ directed: true });
  for (const [cls, deps] of Object.entries(depsMap)) {
    g.setNode(cls);
    const uniqueDeps = new Set(deps);
    uniqueDeps.forEach((dep) => {
      g.setNode(dep);
      g.setEdge(cls, dep, {
        color: "#757575",
      });
    });
  }
  g.setGraph({ rankdir: "LR", bgcolor: "#111111", pad: 0.3 });
  const orderedNodes = alg.topsort(g);
  orderedNodes.forEach((node, rank) => {
    g.setNode(node, {
      shape: "box",
      style: "rounded",
      color: "#c6c5fe",
      fontcolor: "#c6c5fe",
      fontname: "Arial",
      rank: rank,
      height: 0,
    });
  });
  return write(g);
}

const sourceDir = "C:\\Users\\HP\\dev\\FoodFrenzy\\src\\main\\java\\";
const depsMap = buildDependencyMap(sourceDir);
const dotOutput = toDot(depsMap);
console.log(dotOutput);
