![Augment-It Banner with Fern -> Pastel Gradient](https://i.imgur.com/PxOXxv2.png)
# Augment-It on Bolt.new

This version of the project was written in January 2025 and was our first experience with [Vibe Coding](https://www.lossless.group/more-about/vibe-coding).

## Tech Stack

- [x] Bolt.new
- [x] React
- [x] Vite
- [x] TailwindCSS
- [x] Zustand
- [x] Anthropic AI SDK
- [x] Supabase

# Problems Encountered

- Vibe Coding uncovered that LLMs are `lumpers` and not `splitters`, meaning they prefer to have a very few set of files that the will make really really really really really long.  

- We had to go hard on [Prompt Engineering](https://www.lossless.group/vibe-with/us) to get the LLM to generate appropriate Components. 

- Even with really vigilant prompt engineering, the LLM would still randomly overwrite parts of the app with it's new improvised code. And very often it destroyed something that was working exactly as intended, if not removed it entirely.  

- This created a need for better use of git and github to track changes, which we unfortunately realized too late to utilize in managing the complexity of the project. 

- We also recognized the wisdom of microservices architecture, which is usually only needed when projects organically become too complex to manage as a monolith, and the product, design, and engineering teams are large enough to create dedicated teams to manage each [microservice architecture](https://www.lossless.group/more-about/microservices) and [microfrontend architecture](https://www.lossless.group/more-about/microfrontend-architecture). 