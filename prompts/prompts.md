# Ticket Analysis Tool README

## Overview

This tool is designed to analyze Zendesk tickets using AI models, specifically tailored to generate and fill JSON templates based on ticket data. The process involves a series of structured prompts that guide the AI in creating a JSON template and then applying this template to analyze individual tickets.

## File Descriptions

### `get_json_template_1.txt`

- **Purpose**: Sets the overall task for the AI model, providing context and requirements for generating a JSON template.
- **Content**: Instructions for building a JSON template suitable for Zendesk ticket analysis, including structure and fields details.

### `get_json_template_2.txt`

- **Purpose**: Adds specific classification details to refine the JSON template.
- **Content**: Details the types of classifications needed (e.g., Kayako Classic vs. Kayako TNK) and other ticket information (e.g., issue type, requester's name).

### `get_json_template_3.txt`

- **Purpose**: Provides a concrete JSON structure as an example.
- **Content**: An explicit JSON template with fields, options, and comments to serve as a direct model for the AI.

### `analyze_ticket.txt`

- **Purpose**: Instructs the AI model to analyze individual tickets using the generated JSON template.
- **Content**: A prompt directing the AI to fill the provided JSON template with the analysis of a specific ticket's content.

### Rationale for Multiple Files

- **Sequential Learning**: By splitting the instructions into three parts, the AI model is guided through a sequential learning process, starting from a broad understanding of the task and gradually moving towards specifics and practical examples.
- **Enhanced Accuracy**: This step-by-step approach helps in producing a more accurate and relevant JSON template, as the AI model aligns its output closely with the layered instructions.
- **Flexibility**: Separating the prompts into different files allows for easier adjustments and updates to individual aspects of the template generation process without altering the entire instruction set.

## Workflow

1. **Template Generation**:
   - The AI model reads `get_json_template_1.txt`, `get_json_template_2.txt`, and `get_json_template_3.txt` to understand the task of creating a JSON template.
   - It combines the instructions, specifics, and the example template to generate a suitable JSON structure for ticket analysis.

2. **Ticket Analysis**:
   - For each ticket, the AI model is prompted with the content from `analyze_ticket.txt`.
   - The model receives the content of a ticket and the JSON template, and it is tasked with filling the template based on the ticket's information.
   - The AI's response is a curated JSON object with values for each entry in the template, providing a structured analysis of the ticket.

## Usage

- The tool processes batches of ticket IDs, utilizing the AI-generated JSON template for analysis.
- For each ticket, the tool fetches its content and uses the AI model to analyze and fill in the template.
- The outputs are collected and can be formatted into a report, such as a CSV file, for further review or use.
