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
    const isTest = fullPath.includes("test") || fullPath.includes("tests") || entry.name.includes("Test");
    if(isTest) break;
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

function isRepositoryInterface(root) {
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

function getExtendsImplementsTypes(root) {
  return [
    ...(root.descendantsOfType("superclass")[0]?.descendantsOfType("type_identifier") || []),
    ...(root.descendantsOfType("super_interfaces")[0]?.descendantsOfType("type_identifier") || [])
  ]
 .map(c => c.text);
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
  const allDeps = [];
  const allFiles = getAllJavaFiles(dir);
  const allParsed = parseAllFiles(allFiles);

  for (const { root, code, className } of allParsed) {
    const deps = new Set();
    const inheritances = new Set();
    const annotations = getAnnotations(root);

    if (annotations.includes("RequiredArgsConstructor")) {
      getNonNullFields(root).forEach((d) => {
        if (allParsed.some((p) => p.className === d)) {
          deps.add(d);
        }
      });
    }

    if (annotations.includes("AllArgsConstructor")) {
      getAllFields(root).forEach((d) => {
        if (allParsed.some((p) => p.className === d)) {
          deps.add(d);
        }
      });
    }

    if (annotations.includes("Setter")) {
      getSetterInjectedFields(root).forEach((d) => {
        if (allParsed.some((p) => p.className === d)) {
          deps.add(d);
        }
      });
    }

    getAutowiredFields(root).forEach((d) => {
      if (allParsed.some((p) => p.className === d)) {
        deps.add(d);
      }
    });

    getAutowiredSetters(root).forEach((d) => {
      if (allParsed.some((p) => p.className === d)) {
        deps.add(d);
      }
    });

    getConstructorParams(root).forEach((d) => {
      if (allParsed.some((p) => p.className === d)) {
        deps.add(d);
      }
    });

    getImportedDependencies(code, root).forEach((d) => {
      if (allParsed.some((p) => p.className === d)) {
        deps.add(d);
      }
    });

    getComponentScannedPackages(code, root).forEach((d) => {
      if (allParsed.some((p) => p.className === d)) {
        deps.add(d);
      }
    })

    if (isRepositoryInterface(root)) {
      getRepoGenericTypes(root).forEach((d) => {
        if (allParsed.some((p) => p.className === d)) {
          deps.add(d);
        }
      });
    } else {
      getExtendsImplementsTypes(root).forEach((d) => {
        if (allParsed.some((p) => p.className === d)) {
          inheritances.add(d);
        }
      });
    }

    allDeps.push({
      "className": className,
      "deps": deps,
      "inheritances": inheritances
    });
  }
  return allDeps;
}

function toDot(allDeps) {
  const g = new Graph({ directed: true });
  for (const file of allDeps) {
    g.setNode(file.className);
    file.deps.forEach((dep) => {
      g.setNode(dep);
      g.setEdge(file.className, dep, {
        color: "#0b269e",
      });
    });
    file.inheritances.forEach((parent) => {
      g.setNode(parent);
      g.setEdge(file.className, parent, {
        style: "dotted",
        color: "#888888"
      })
    });
  }
  g.setGraph({ rankdir: "LR", bgcolor: "#ffffff", pad: 0.3, layout: "dot" });
  const orderedNodes = alg.topsort(g);
  orderedNodes.forEach((node, rank) => {
    g.setNode(node, {
      shape: "box",
      style: "rounded",
      color: "#0b269e",
      fontcolor: "#0b269e",
      fontname: "Arial",
      fontsize: 14,
      rank: rank,
      height: 0,
    });
  });
  return write(g);
}

const sourceDir = "C:\\Users\\HP\\dev\\piggymetrics\\";
const depsMap = buildDependencyMap(sourceDir);
const dotOutput = toDot(depsMap);
console.log(dotOutput);
