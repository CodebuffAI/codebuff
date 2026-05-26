import React from "react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "../ui/table";

export function ProjectMessagesTable({ messages }: { messages: any[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Content</TableHead>
          <TableHead>Tool Call</TableHead>
          <TableHead>Result</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {messages?.map((msg: any) => (
          <TableRow key={msg._id}>
            <TableCell>{new Date(msg.date).toLocaleString()}</TableCell>
            <TableCell>{msg.role}</TableCell>
            <TableCell className="max-w-xs truncate" title={msg.content}>
              {msg.content}
            </TableCell>
            <TableCell>{msg.tool_call || "-"}</TableCell>
            <TableCell className="max-w-xs truncate" title={msg.result}>
              {msg.result || "-"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
