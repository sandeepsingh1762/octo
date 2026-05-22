// Quick smoke: Ink + React 18 loads without ReactCurrentOwner error
import React from "react";
import { render, Text } from "ink";

const { waitUntilExit } = render(React.createElement(Text, { color: "green" }, "TUI OK"));
await waitUntilExit();
console.log("verify-tui: success");
