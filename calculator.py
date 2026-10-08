def calculate_grade(average: float) -> str:
    if average >= 90:
        return "A"
    if average >= 80:
        return "B"
    if average >= 70:
        return "C"
    if average >= 60:
        return "D"
    return "F"


def main() -> None:
    marks = []

    for subject_number in range(1, 6):
        while True:
            try:
                mark = float(input(f"Enter marks for subject {subject_number} (0-100): "))
            except ValueError:
                print("Invalid input. Please enter a number.")
                continue

            if 0 <= mark <= 100:
                marks.append(mark)
                break

            print("Marks must be between 0 and 100. Please try again.")

    total = sum(marks)
    average = total / len(marks)
    grade = calculate_grade(average)

    print("\nResults")
    print(f"Total marks: {total:.2f} / 500")
    print(f"Average marks: {average:.2f}")
    print(f"Grade: {grade}")


if __name__ == "__main__":
    main()