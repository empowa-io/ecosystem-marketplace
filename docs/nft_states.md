
```mermaid
flowchart LR
    start((start))
    listed((listed))
    finish((end))

    start  --> | list | listed
    listed --> | buy | finish
    listed --> | cancel | finish
    listed --> | update | listed
```