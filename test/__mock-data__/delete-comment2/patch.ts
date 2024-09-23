@@ -1,9 +1,9 @@
-import { isAdminId, isModId } from 'common/envs/constants'
-import { getContract } from 'shared/utils'
-import { getComment } from 'shared/supabase/contract-comments'
 import { createSupabaseDirectClient } from 'shared/supabase/init'
 import { APIError, type APIHandler } from './helpers/endpoint'
+import { getComment } from 'shared/supabase/contract-comments'
+import { getContract, revalidateContractStaticProps } from 'shared/utils'
+import { isAdminId, isModId } from 'common/envs/constants'
 
 export const deleteComment: APIHandler<'delete-comment'> = async (
   { commentId },
   auth
@@ -23,11 +23,13 @@
   const isContractCreator = contract.creatorId === auth.uid
   const isCommentCreator = comment.userId === auth.uid
 
   if (!isAdminId(auth.uid) && !isContractCreator && !isCommentCreator && !isModId(auth.uid)) {
-    throw new APIError(403, 'Only the comment creator, market creator, or mod can delete comments')
+    throw new APIError(403, 'You do not have permission to delete this comment')
   }
 
-  await pg.none('DELETE FROM contract_comments WHERE comment_id = $1', [commentId])
+  await pg.none(`DELETE FROM contract_comments WHERE comment_id = $1`, [commentId])
 
+  await revalidateContractStaticProps(contract)
+
   return { success: true }
 }
