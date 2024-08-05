  // ... existing endpoints ...

  'delete-comment': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    props: z.object({
      commentId: z.string(),
    }).strict(),
    returns: {} as { success: boolean },
  },

  // ... existing code ...
} as const)

// ... existing code ...