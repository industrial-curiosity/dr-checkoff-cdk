"use strict"

// build-layers copies layers/src folder contents into layer/build, then runs
// the npm install and prune commands
// additionally, copies in linux builds for packages (eg. bcrypt) which must
// be compiled for aws targets

const fs = require("fs");
const fse = require("fs-extra");
const childProcess = require("child_process");

console.log('building layers...')

// ensure layers directory created
fs.mkdirSync('layers/src', {recursive: true});
console.log(`deleting previous build directories...`);
fs.rmdirSync('layers/build', { recursive: true })

// get layers' src directories
let srcdirs = fs.readdirSync('layers/src', { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)

for (let i in srcdirs) {
    let layer = srcdirs[i];
    console.log(`\nprocessing layer ${layer}...`);

    let layerSrcPath = `layers/src/${layer}`
    let layerBuildPath = `layers/build/${layer}/nodejs`

    console.log(`(re)creating build directory...`);
    fs.mkdirSync(layerBuildPath, { recursive: true });

    // copy everything except the package-lock file and node_modules
    let srcContents = fs.readdirSync(layerSrcPath, { withFileTypes: true })
        .filter(dirent => {
            return !(
                dirent.name == "node_modules" ||
                dirent.name == "package-lock.json"
            )
        })
        .map(dirent => dirent.name)
    for (let i in srcContents) {
        let file = srcContents[i];
        fse.copySync(`${layerSrcPath}/${file}`, `${layerBuildPath}/${file}`);
    }

    console.log("installing npm dependencies...");
    childProcess.execSync('npm install', { cwd: layerBuildPath });
    console.log("pruning unused npm modules...");
    childProcess.execSync('npm prune', { cwd: layerBuildPath });

    // if "bcrypt" in the package file
    let packageJsonContents = fs.readFileSync(`${layerBuildPath}/package.json`, "utf8");
    if (packageJsonContents.includes('"bcrypt"')) {
        console.log("bcrypt found, replacing with linux build");
        // overwrite with the node_modules subfolder from linux-builds
        fs.rmdirSync(`${layerBuildPath}/node_modules/bcrypt`, { recursive: true })
        fse.copySync(`linux-builds/bcrypt`, `${layerBuildPath}/node_modules/bcrypt`);
    }

    console.log("removing package-lock.json...");
    fs.unlinkSync(`${layerBuildPath}/package-lock.json`);

    console.log(`${layer} folder build complete`);
}

console.log('layer builds completed.')
