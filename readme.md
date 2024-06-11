# Boilerplate Code Integration Guide

This guide explains how to integrate this boilerplate code into your new project. Follow these steps to set up your project quickly.

## Steps to Import Boilerplate Code into a New Git Project

1. **Navigate to Your New Project Directory**:
   Make sure you are in the root directory of your new project.
   ```sh
   cd path/to/your/new/project
   ```
2. **Initialize a New Git Repository:**:
   ```sh
   git init
   ```
3. **Add the Boilerplate Repository as a Remote:**:

   ```sh
   git remote add boilerplate https://github.com/Moganesan/node-typescript-boilerplate.git
   ```

4. **Fetch the contents of the boilerplate repository:**:

   ```sh
   git fetch boilerplate
   ```

5. **Merge the Boilerplate Code into Your New Project:**:

   ```sh
   git merge boilerplate/master --allow-unrelated-histories
   ```

6. **Resolve Any Merge Conflicts:**

   ```sh
   git add .
   git commit -m "Resolved merge conflicts"
   ```

7. **Remove the Boilerplate Remote:**

   ```sh
   git remote remove boilerplate
   ```
