import pandas as pd
import json

def inspect_file(filename, label):
    print(f"\n=== {label} ({filename}) ===")
    df = pd.read_excel(filename)
    print("Columns:", df.columns.tolist())
    print("\nFirst 3 rows:")
    print(df.head(3).to_string())
    print("\nShape:", df.shape)

inspect_file('LIST OF LEGAL TUCKSHOPS GWERU CITY WIDE (1).xlsx', 'TUCKSHOPS')
inspect_file('Book2.xlsx', 'BOOK2')
