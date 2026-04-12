import os
import subprocess
import sys
from hatchling.builders.hooks.plugin.interface import BuildHookInterface

BUNDLE_FILES = [
    "image_labelling_tool/static/labelling_tool/labelling_tool.bundle.js",
    "image_labelling_tool/static/schema_editor/schema_editor.bundle.js",
]


class CustomBuildHook(BuildHookInterface):
    """Run `npm run build` before building so TypeScript sources in ui/ are
    compiled into the bundle JS files required by the package.

    The step is skipped when the bundles already exist on disk (e.g. when
    building a wheel from an sdist that already contains them).
    """

    PLUGIN_NAME = "custom"

    def initialize(self, version, build_data):
        # Skip if bundles already exist (e.g. building wheel from sdist)
        if all(os.path.isfile(os.path.join(self.root, f)) for f in BUNDLE_FILES):
            return

        node_modules = os.path.join(self.root, "node_modules")
        if not os.path.isdir(node_modules):
            self.app.display_error(
                "node_modules not found. Run `npm install` before building."
            )
            sys.exit(1)

        self.app.display_info("Running npm run build to compile TypeScript bundles...")
        npm = "npm.cmd" if sys.platform == "win32" else "npm"
        result = subprocess.run(
            [npm, "run", "build"],
            cwd=self.root,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            self.app.display_error("npm run build failed:")
            self.app.display_error(result.stdout)
            self.app.display_error(result.stderr)
            sys.exit(1)
        self.app.display_success("npm run build completed successfully.")
