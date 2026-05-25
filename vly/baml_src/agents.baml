

class LinkedDocument {
    document_id string @description("exact id of the document to reference")
    description string @description("the brief description of the reference link reason")
}

class EditDocument {
    type "edit_document" | "add_document"
    document_id string @description("exact id of the document to edit or add. brief snake case semantic id")
    document_tag string? @description("only for new documents: a highlighted tag for the document, as a flair. ie: page, component, backend function, library, etc.")
    new_content string @description("the new multiline content of the document to replace the old content or for new document")
    new_references LinkedDocument[] @description("the document links to replace the old document links or for new document")
}


class DocumentAgent {
    reasoning string @description("brief reasoning for the action")
    action EditDocument[] @description("brief list of document agent actions to take")
}

class CodingAgent {
    reasoning string @description("brief reasoning for the action")
    action CodingAgentAction[] @description("brief list of coding agent actions to take")
}

class CodingAgentAction {
    type "read_in_file" | "edit_file" | "create_file" | "run_command"
    file_path string? @description("the path to the file to read, edit, create. empty if run command")
    content string? @description("the content to write to the file, the edit snippet, or the command to run in the shell. empty if read in file")
}


class SpawnCodingAgent {
    type "spawn_coding_agent"
    relevant_files string[] @description("the relevant files to read or edit")
    instruction_ids string[] @description("the instruction file paths to read as instructions")
}

class SpawnDocumentAgent {
    type "spawn_document_agent"
    relevant_files string[] @description("the relevant files to read or edit")
    instruction_ids string[] @description("the instruction file paths to read as instructions")
}



// intial document entry point is always the schema ts file


// main agent has access to the main document of the edit, file structure, 



// 1. hydrate the prompt


// 2. 