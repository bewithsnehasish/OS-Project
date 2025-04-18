import tkinter as tk
from collections import deque
from tkinter import messagebox, scrolledtext, simpledialog, ttk


class VirtualMemorySimulator:
    def __init__(self, master):
        self.master = master
        master.title("Virtual Memory Simulator (Paging + LRU)")
        master.geometry("800x600")

        # --- Configuration ---
        self.num_frames = tk.IntVar(value=4)  # Default RAM size (number of frames)
        self.page_access_string = tk.StringVar(
            value="1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5"
        )  # Default access sequence
        self.page_size = tk.IntVar(value=1024)  # Default page size (conceptual for now)

        # --- Simulation State ---
        self.ram_frames = []  # Stores the page number currently in each frame
        self.lru_queue = deque()  # Tracks access order for LRU (most recent at right)
        self.page_table = {}  # {page_num: {'frame': frame_idx, 'present': bool}}
        self.access_sequence = []
        self.current_step = 0
        self.page_faults = 0
        self.total_accesses = 0

        # --- GUI Elements ---
        self.create_widgets()
        self.reset_simulation()  # Initialize display

    def create_widgets(self):
        # --- Control Frame ---
        control_frame = ttk.Frame(self.master, padding="10")
        control_frame.pack(side=tk.TOP, fill=tk.X)

        ttk.Label(control_frame, text="RAM Frames:").grid(
            row=0, column=0, padx=5, pady=5, sticky=tk.W
        )
        ttk.Entry(control_frame, textvariable=self.num_frames, width=5).grid(
            row=0, column=1, padx=5, pady=5
        )

        ttk.Label(control_frame, text="Page Size (Conceptual):").grid(
            row=0, column=2, padx=5, pady=5, sticky=tk.W
        )
        ttk.Entry(
            control_frame, textvariable=self.page_size, width=8, state=tk.DISABLED
        ).grid(
            row=0, column=3, padx=5, pady=5
        )  # Disabled for now

        ttk.Label(control_frame, text="Page Access Sequence (comma-separated):").grid(
            row=1, column=0, padx=5, pady=5, sticky=tk.W
        )
        ttk.Entry(control_frame, textvariable=self.page_access_string, width=50).grid(
            row=1, column=1, columnspan=3, padx=5, pady=5, sticky=tk.EW
        )

        button_frame = ttk.Frame(control_frame)
        button_frame.grid(row=2, column=0, columnspan=4, pady=10)

        self.init_button = ttk.Button(
            button_frame, text="Initialize/Reset", command=self.reset_simulation
        )
        self.init_button.pack(side=tk.LEFT, padx=5)

        self.step_button = ttk.Button(
            button_frame, text="Step", command=self.step_simulation, state=tk.DISABLED
        )
        self.step_button.pack(side=tk.LEFT, padx=5)

        self.run_all_button = ttk.Button(
            button_frame,
            text="Run All",
            command=self.run_all_simulation,
            state=tk.DISABLED,
        )
        self.run_all_button.pack(side=tk.LEFT, padx=5)

        # --- Visualization Frame ---
        vis_frame = ttk.Frame(self.master, padding="10")
        vis_frame.pack(side=tk.TOP, fill=tk.BOTH, expand=True)
        vis_frame.columnconfigure(0, weight=1)
        vis_frame.columnconfigure(1, weight=2)
        vis_frame.rowconfigure(1, weight=1)  # Allow text area to expand

        # --- RAM Display ---
        ram_label_frame = ttk.LabelFrame(vis_frame, text="Physical Memory (RAM Frames)")
        ram_label_frame.grid(row=0, column=0, padx=10, pady=10, sticky="nsew")
        self.ram_canvas = tk.Canvas(ram_label_frame, bg="lightgrey", width=150)
        self.ram_canvas.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        # --- Status Display ---
        status_frame = ttk.LabelFrame(vis_frame, text="Simulation Status")
        status_frame.grid(row=0, column=1, padx=10, pady=10, sticky="nsew")

        self.status_label = ttk.Label(
            status_frame, text="Status: Idle", font=("Arial", 10)
        )
        self.status_label.pack(pady=5, padx=5, anchor=tk.W)
        self.fault_label = ttk.Label(
            status_frame, text="Page Faults: 0", font=("Arial", 10)
        )
        self.fault_label.pack(pady=5, padx=5, anchor=tk.W)
        self.access_label = ttk.Label(
            status_frame, text="Total Accesses: 0", font=("Arial", 10)
        )
        self.access_label.pack(pady=5, padx=5, anchor=tk.W)
        self.lru_label = ttk.Label(
            status_frame,
            text="LRU Queue (<- Least | Most ->): []",
            font=("Arial", 10),
            wraplength=400,
        )
        self.lru_label.pack(pady=5, padx=5, anchor=tk.W)

        # --- Log Display ---
        log_frame = ttk.LabelFrame(vis_frame, text="Event Log")
        log_frame.grid(row=1, column=0, columnspan=2, padx=10, pady=10, sticky="nsew")

        self.log_text = scrolledtext.ScrolledText(
            log_frame, wrap=tk.WORD, height=15, width=80, state=tk.DISABLED
        )
        self.log_text.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

    def log_message(self, message):
        self.log_text.config(state=tk.NORMAL)
        self.log_text.insert(tk.END, message + "\n")
        self.log_text.see(tk.END)  # Scroll to the bottom
        self.log_text.config(state=tk.DISABLED)

    def update_ram_display(self):
        self.ram_canvas.delete("all")
        frame_height = 40
        frame_width = 100
        padding = 10
        max_frames_display = max(
            10, self.num_frames.get()
        )  # Show at least 10 slots visually or actual number if > 10

        canvas_height = max_frames_display * (frame_height + padding) + padding
        self.ram_canvas.config(
            scrollregion=(0, 0, frame_width + 2 * padding, canvas_height)
        )
        self.ram_canvas.config(height=min(400, canvas_height))  # Limit visual height

        for i in range(self.num_frames.get()):
            y_pos = padding + i * (frame_height + padding)
            fill_color = "white"
            page_text = "Empty"
            if i < len(self.ram_frames) and self.ram_frames[i] is not None:
                fill_color = "lightblue"
                page_text = f"Page {self.ram_frames[i]}"

            self.ram_canvas.create_rectangle(
                padding,
                y_pos,
                padding + frame_width,
                y_pos + frame_height,
                fill=fill_color,
                outline="black",
            )
            self.ram_canvas.create_text(
                padding + frame_width / 2, y_pos + frame_height / 2, text=f"Frame {i}"
            )
            self.ram_canvas.create_text(
                padding + frame_width / 2,
                y_pos + frame_height / 2 + 15,
                text=page_text,
                font=("Arial", 9),
            )

        # Indicate frames beyond actual RAM if needed for visual consistency
        for i in range(self.num_frames.get(), max_frames_display):
            y_pos = padding + i * (frame_height + padding)
            self.ram_canvas.create_rectangle(
                padding,
                y_pos,
                padding + frame_width,
                y_pos + frame_height,
                fill="lightgrey",
                outline="darkgrey",
                dash=(2, 2),
            )
            self.ram_canvas.create_text(
                padding + frame_width / 2,
                y_pos + frame_height / 2,
                text=f"Frame {i}",
                fill="grey",
            )

    def update_status_display(self, status_msg=""):
        self.status_label.config(text=f"Status: {status_msg}")
        self.fault_label.config(text=f"Page Faults: {self.page_faults}")
        self.access_label.config(text=f"Total Accesses: {self.total_accesses}")
        lru_str = ", ".join(map(str, self.lru_queue))
        self.lru_label.config(text=f"LRU Queue (<- Least | Most ->): [{lru_str}]")

    def reset_simulation(self):
        try:
            num_frames = self.num_frames.get()
            if num_frames <= 0:
                raise ValueError("Number of frames must be positive.")

            # Parse access sequence
            pages_str = self.page_access_string.get().strip()
            if not pages_str:
                self.access_sequence = []
            else:
                self.access_sequence = [int(p.strip()) for p in pages_str.split(",")]
                if any(p < 0 for p in self.access_sequence):
                    raise ValueError("Page numbers cannot be negative.")

        except ValueError as e:
            messagebox.showerror("Input Error", f"Invalid input: {e}")
            return

        self.ram_frames = [
            None
        ] * num_frames  # Represents physical frames, None if empty
        self.lru_queue.clear()  # Tracks usage order (least recent at left, most recent at right)
        self.page_table = {}  # Reset page table
        self.current_step = 0
        self.page_faults = 0
        self.total_accesses = 0

        self.log_text.config(state=tk.NORMAL)
        self.log_text.delete("1.0", tk.END)
        self.log_message(f"--- Simulation Initialized ---")
        self.log_message(f"RAM Frames: {num_frames}")
        self.log_message(f"Access Sequence: {self.access_sequence}")
        self.log_text.config(state=tk.DISABLED)

        self.update_ram_display()
        self.update_status_display("Initialized. Ready to step.")

        if self.access_sequence:
            self.step_button.config(state=tk.NORMAL)
            self.run_all_button.config(state=tk.NORMAL)
        else:
            self.step_button.config(state=tk.DISABLED)
            self.run_all_button.config(state=tk.DISABLED)

    def step_simulation(self):
        if self.current_step >= len(self.access_sequence):
            self.log_message("--- End of Access Sequence ---")
            self.update_status_display("Finished.")
            self.step_button.config(state=tk.DISABLED)
            self.run_all_button.config(state=tk.DISABLED)
            return

        page_num = self.access_sequence[self.current_step]
        self.total_accesses += 1
        status_msg = f"Accessing Page {page_num}"
        self.log_message(f"\nStep {self.current_step + 1}: Accessing Page {page_num}")

        # Check if page is in RAM (Page Hit or Fault?)
        if page_num in self.page_table and self.page_table[page_num]["present"]:
            # --- Page Hit ---
            status_msg += " -> Page Hit!"
            self.log_message(
                f"  Page {page_num} found in Frame {self.page_table[page_num]['frame']}. (Hit)"
            )

            # Update LRU status: move accessed page to the end (most recently used)
            self.lru_queue.remove(page_num)
            self.lru_queue.append(page_num)

        else:
            # --- Page Fault ---
            self.page_faults += 1
            status_msg += " -> Page Fault!"
            self.log_message(f"  Page {page_num} not in RAM. (Page Fault)")

            # Find a frame for the new page
            target_frame = -1

            # Is there an empty frame?
            try:
                target_frame = self.ram_frames.index(None)
                self.log_message(f"  Found empty Frame {target_frame}.")
            except ValueError:
                # No empty frames - Eviction needed (LRU)
                if not self.lru_queue:
                    # This case should ideally not happen if RAM has size > 0 and we faulted
                    messagebox.showerror(
                        "Simulation Error",
                        "LRU queue empty during fault with full RAM!",
                    )
                    return

                victim_page = (
                    self.lru_queue.popleft()
                )  # Evict least recently used (leftmost)
                target_frame = self.page_table[victim_page]["frame"]

                self.log_message(
                    f"  RAM full. Evicting Page {victim_page} (LRU) from Frame {target_frame}."
                )

                # Update page table for the victim page
                self.page_table[victim_page]["present"] = False
                self.page_table[victim_page]["frame"] = None  # No longer in a frame
                self.ram_frames[target_frame] = None  # Mark frame as empty temporarily

            # Load the new page into the target frame
            self.ram_frames[target_frame] = page_num
            self.log_message(f"  Loading Page {page_num} into Frame {target_frame}.")

            # Update page table for the new page
            if page_num not in self.page_table:
                self.page_table[page_num] = {
                    "frame": None,
                    "present": False,
                }  # Initialize if first time seen
            self.page_table[page_num]["frame"] = target_frame
            self.page_table[page_num]["present"] = True

            # Add the new page to the end of LRU queue (most recently used)
            self.lru_queue.append(page_num)

        # --- Update State and Display ---
        self.current_step += 1
        self.update_ram_display()
        self.update_status_display(status_msg)

        # Disable buttons if simulation finished
        if self.current_step >= len(self.access_sequence):
            self.log_message("\n--- End of Access Sequence ---")
            self.update_status_display(f"Accessing Page {page_num} -> Finished.")
            self.step_button.config(state=tk.DISABLED)
            self.run_all_button.config(state=tk.DISABLED)

    def run_all_simulation(self):
        if self.current_step >= len(self.access_sequence):
            return  # Already finished

        # Temporarily disable buttons during run
        self.step_button.config(state=tk.DISABLED)
        self.run_all_button.config(state=tk.DISABLED)
        self.init_button.config(state=tk.DISABLED)

        while self.current_step < len(self.access_sequence):
            self.step_simulation()
            # Add a small delay if you want to see the steps happen rapidly
            # self.master.update_idletasks() # Process GUI events
            # time.sleep(0.1) # Requires 'import time'

        # Re-enable init button when done
        self.init_button.config(state=tk.NORMAL)
        self.log_message("\n--- Run All Complete ---")


# --- Main ---
if __name__ == "__main__":
    root = tk.Tk()
    app = VirtualMemorySimulator(root)
    root.mainloop()
