import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

interface InputProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export const ChatInput: React.FC<InputProps> = ({ value, onChange, onSubmit, disabled, placeholder }) => {
  useInput((input, key) => {
    if (disabled) return;
    if (key.return) {
      onSubmit();
      return;
    }
    if (key.backspace || key.delete) {
      onChange(value.slice(0, -1));
      return;
    }
    if (input) {
      onChange(value + input);
    }
  });

  return (
    <Box flexDirection="row" paddingX={1} borderStyle="single" borderColor={disabled ? "gray" : "cyan"}>
      <Text color="cyan" bold>
        {"octopus> "}
      </Text>
      <Text color={disabled ? "gray" : "white"}>{value || placeholder || ""}</Text>
      {!disabled && <Text color="cyan">▎</Text>}
    </Box>
  );
};
