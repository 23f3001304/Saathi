// Chat management is state, not decoration: archiving hides without
// destroying, deleting removes, and groups partition the list.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  ChatHistory,
  type ChatSessionMeta,
} from "../src/conversation/ChatHistory.tsx";

const SESSIONS: ChatSessionMeta[] = [
  {
    id: 1,
    startedAt: "2:21 pm",
    title: "A navy kurta",
    status: "signed",
    group: "Chats",
    archived: false,
    conversationId: "cnv_kurta",
  },
  {
    id: 2,
    startedAt: "2:22 pm",
    title: "Running shoes",
    status: "in-progress",
    group: "Chats",
    archived: false,
    conversationId: "cnv_shoes",
  },
  {
    id: 3,
    startedAt: "1:04 pm",
    title: "Diwali gifts",
    status: "signed",
    group: "Gifts",
    archived: true,
    conversationId: "cnv_gifts",
  },
];

function renderHistory(
  overrides: Partial<Parameters<typeof ChatHistory>[0]> = {},
) {
  const props = {
    sessions: SESSIONS,
    activeId: 2,
    groups: ["Chats", "Gifts"],
    onSelect: vi.fn(),
    onToggleArchive: vi.fn(),
    onDelete: vi.fn(),
    onNewGroup: vi.fn(),
    ...overrides,
  };
  render(<ChatHistory {...props} />);
  return props;
}

describe("ChatHistory", () => {
  it("groups live chats under their group heading", () => {
    renderHistory();
    expect(screen.getByText("Chats")).toBeDefined();
    expect(screen.getByText("A navy kurta")).toBeDefined();
    expect(screen.getByText("Running shoes")).toBeDefined();
  });

  it("hides archived chats until they are asked for", () => {
    renderHistory();
    expect(screen.queryByText("Diwali gifts")).toBeNull();
    fireEvent.click(screen.getByText("Archived (1)"));
    expect(screen.getByText("Diwali gifts")).toBeDefined();
  });

  it("archiving reports the chat, it does not delete it", () => {
    const props = renderHistory();
    fireEvent.click(screen.getAllByLabelText("Archive chat")[0]!);
    expect(props.onToggleArchive).toHaveBeenCalledTimes(1);
    expect(props.onDelete).not.toHaveBeenCalled();
  });

  it("deleting reports exactly the chat asked for", () => {
    const props = renderHistory();
    // Rows render newest-first, so the first Delete belongs to id 2.
    fireEvent.click(screen.getAllByLabelText("Delete chat")[0]!);
    expect(props.onDelete).toHaveBeenCalledWith(2);
  });

  it("names a new group and never an empty one", () => {
    const props = renderHistory();
    fireEvent.click(screen.getByText("+ New group"));
    const input = screen.getByPlaceholderText("Group name");

    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onNewGroup).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("+ New group"));
    const retry = screen.getByPlaceholderText("Group name");
    fireEvent.change(retry, { target: { value: "Household" } });
    fireEvent.keyDown(retry, { key: "Enter" });
    expect(props.onNewGroup).toHaveBeenCalledWith("Household");
  });
});
