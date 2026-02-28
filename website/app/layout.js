"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
exports.default = RootLayout;
const google_1 = require("next/font/google");
require("./globals.css");
const inter = (0, google_1.Inter)({ subsets: ["latin"] });
exports.metadata = {
    title: "Docker Quick Actions — Manage Docker containers from VS Code",
    description: "A lightweight VS Code extension to manage Docker containers directly from your editor. Start, stop, restart, view logs, and open terminals — all in one click.",
    keywords: [
        "docker",
        "vscode",
        "extension",
        "containers",
        "devtools",
    ],
    openGraph: {
        title: "Docker Quick Actions",
        description: "Manage Docker containers directly from VS Code. Start, stop, view logs, and more.",
        type: "website",
    },
};
function RootLayout({ children, }) {
    return (<html lang="en">
      <body className={inter.className}>{children}</body>
    </html>);
}
//# sourceMappingURL=layout.js.map